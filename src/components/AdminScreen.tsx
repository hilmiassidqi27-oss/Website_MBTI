import React, { useState, useEffect } from 'react';
import { AssessmentSubmission } from '../types';
import { questions } from '../data/questions';
import { mbtiDetails } from '../data/mbtiData';
import {
  Shield,
  Search,
  Lock,
  Download,
  Trash2,
  Eye,
  LogOut,
  Users,
  Award,
  Clock,
  Plus,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Settings,
  Copy,
  Check,
  Code,
  Sparkles,
  Link2,
  X,
  HelpCircle,
  Key,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  requestGoogleAccessToken,
  createGoogleSpreadsheet,
  getStoredSpreadsheetId,
  setStoredSpreadsheetId,
  getStoredSpreadsheetUrl,
  setStoredSpreadsheetUrl,
  getStoredWebhookUrl,
  setStoredWebhookUrl,
  getStoredAccessToken,
  clearGoogleAuth,
  syncAllSubmissionsToWebhook,
  getGoogleAppsScriptCode,
} from '../lib/googleSheets';
import {
  saveGoogleSheetSettingsToFirestore,
  getGoogleSheetSettingsFromFirestore,
} from '../lib/firebase';

interface AdminScreenProps {
  submissions: AssessmentSubmission[];
  isAuthenticated: boolean;
  onLoginSuccess: () => void;
  onLogout: () => void;
  onSelectSubmission: (sub: AssessmentSubmission) => void;
  onDeleteSubmission: (id: string) => void;
  onAddSampleData: () => void;
  onClose: () => void;
  onRefreshFromCloud?: () => Promise<AssessmentSubmission[]>;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({
  submissions,
  isAuthenticated,
  onLoginSuccess,
  onLogout,
  onSelectSubmission,
  onDeleteSubmission,
  onAddSampleData,
  onClose,
  onRefreshFromCloud,
}) => {
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mbtiFilter, setMbtiFilter] = useState('ALL');
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);
  const [cloudRefreshMsg, setCloudRefreshMsg] = useState<string | null>(null);

  // Google Sheets Sync State
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [webhookInput, setWebhookInput] = useState(() => getStoredWebhookUrl() || '');
  const [customSheetUrlInput, setCustomSheetUrlInput] = useState(() => getStoredSpreadsheetUrl() || '');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'webhook' | 'oauth' | 'formula'>('webhook');

  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(() => getStoredSpreadsheetUrl());
  const [hasWebhook, setHasWebhook] = useState<boolean>(() => Boolean(getStoredWebhookUrl()));
  const [hasOAuth, setHasOAuth] = useState<boolean>(() => Boolean(getStoredAccessToken()));

  // Load latest global settings from Firestore on mount
  useEffect(() => {
    getGoogleSheetSettingsFromFirestore().then((settings) => {
      if (settings) {
        if (settings.webhookUrl) {
          setWebhookInput(settings.webhookUrl);
          setStoredWebhookUrl(settings.webhookUrl);
          setHasWebhook(true);
        }
        if (settings.spreadsheetUrl) {
          setSpreadsheetUrl(settings.spreadsheetUrl);
          setCustomSheetUrlInput(settings.spreadsheetUrl);
          setStoredSpreadsheetUrl(settings.spreadsheetUrl);
        }
        if (settings.spreadsheetId) {
          setStoredSpreadsheetId(settings.spreadsheetId);
        }
      }
    });
  }, []);

  // Handler for direct Google OAuth (with account chooser)
  const handleSyncGoogleOAuth = async (forceSelectAccount = false) => {
    try {
      setIsSyncingSheet(true);
      setSheetSyncStatus('Menghubungkan ke Akun Google...');

      const token = await requestGoogleAccessToken(forceSelectAccount);
      setSheetSyncStatus('Membuat / memperbarui Google Spreadsheet...');

      const result = await createGoogleSpreadsheet(token, submissions);
      setSpreadsheetUrl(result.spreadsheetUrl);
      setCustomSheetUrlInput(result.spreadsheetUrl);
      setHasOAuth(true);
      setSheetSyncStatus('Sukses! Google Sheet terhubung via OAuth.');
      setTimeout(() => setSheetSyncStatus(null), 5000);
    } catch (err: any) {
      console.error(err);
      setSheetSyncStatus(`Catatan OAuth: ${err.message || 'Gagal otentikasi'}. Disarankan pakai Webhook untuk Vercel.`);
      setTimeout(() => setSheetSyncStatus(null), 8000);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Handler to save and sync via Webhook (Unblockable & Vercel-ready)
  const handleSaveWebhook = async () => {
    const trimmed = webhookInput.trim();
    if (!trimmed) {
      alert('Silakan masukkan Web App URL Google Apps Script Anda.');
      return;
    }

    try {
      setIsSyncingSheet(true);
      setSheetSyncStatus('Menyimpan & menyinkronkan data ke Google Sheet...');

      setStoredWebhookUrl(trimmed);
      setHasWebhook(true);

      if (customSheetUrlInput.trim()) {
        setStoredSpreadsheetUrl(customSheetUrlInput.trim());
        setSpreadsheetUrl(customSheetUrlInput.trim());
      }

      // Save to Firestore so all admins & candidates use it
      await saveGoogleSheetSettingsToFirestore({
        webhookUrl: trimmed,
        spreadsheetUrl: customSheetUrlInput.trim() || undefined,
      });

      // Sync all current submissions
      await syncAllSubmissionsToWebhook(trimmed, submissions);

      setSheetSyncStatus('Berhasil! Seluruh data tersinkronisasi ke Google Sheet.');
      setTimeout(() => setSheetSyncStatus(null), 5000);
      setShowSettingsModal(false);
    } catch (err: any) {
      console.error(err);
      setSheetSyncStatus(`Gagal sinkron: ${err.message}`);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Handler to sync all data to existing webhook
  const handleSyncAllWebhook = async () => {
    const url = getStoredWebhookUrl();
    if (!url) {
      setShowSettingsModal(true);
      return;
    }

    try {
      setIsSyncingSheet(true);
      setSheetSyncStatus('Mengirim ulang semua data ke Google Sheet...');
      await syncAllSubmissionsToWebhook(url, submissions);
      setSheetSyncStatus('Sukses! Semua data berhasil dikirim ulang.');
      setTimeout(() => setSheetSyncStatus(null), 4000);
    } catch (err: any) {
      setSheetSyncStatus(`Gagal: ${err.message}`);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleRefreshCloudData = async () => {
    if (!onRefreshFromCloud) return;
    try {
      setIsRefreshingCloud(true);
      setCloudRefreshMsg('Mengambil data terbaru dari cloud server...');
      const data = await onRefreshFromCloud();
      setCloudRefreshMsg(`Sukses! ${data.length} data tersinkronisasi dari Cloud Server.`);
      setTimeout(() => setCloudRefreshMsg(null), 4000);
    } catch (err: any) {
      setCloudRefreshMsg(`Gagal memuat: ${err.message || 'Koneksi error'}`);
      setTimeout(() => setCloudRefreshMsg(null), 5000);
    } finally {
      setIsRefreshingCloud(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getGoogleAppsScriptCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleLogoutGoogle = () => {
    clearGoogleAuth();
    setHasOAuth(false);
    setSheetSyncStatus('Akun Google telah dikeluarkan.');
    setTimeout(() => setSheetSyncStatus(null), 3000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'adminmbti123') {
      onLoginSuccess();
      setErrorMsg('');
      setPassword('');
    } else {
      setErrorMsg('Kata sandi salah. Akses ditolak.');
    }
  };

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch =
      sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.nik.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.position.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.mbti.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMbti = mbtiFilter === 'ALL' || sub.mbti === mbtiFilter;
    return matchesSearch && matchesMbti;
  });

  // Calculate stats
  const totalCount = submissions.length;
  const mbtiCounts: Record<string, number> = {};
  submissions.forEach((s) => {
    mbtiCounts[s.mbti] = (mbtiCounts[s.mbti] || 0) + 1;
  });
  let topMbti = '-';
  let topCount = 0;
  Object.entries(mbtiCounts).forEach(([mbti, count]) => {
    if (count > topCount) {
      topMbti = mbti;
      topCount = count;
    }
  });

  const exportExcel = () => {
    if (filteredSubmissions.length === 0) return alert('Tidak ada data untuk diexport!');

    const getCandidateAnswers = (s: AssessmentSubmission): Record<number, number> => {
      if (s.answers && Object.keys(s.answers).length > 0) {
        return s.answers;
      }
      const reconstructed: Record<number, number> = {};
      const isE = (s.percentages?.E ?? 50) >= 50;
      const isS = (s.percentages?.S ?? 50) >= 50;
      const isT = (s.percentages?.T ?? 50) >= 50;
      const isJ = (s.percentages?.J ?? 50) >= 50;

      questions.forEach((q) => {
        let isPositiveDim = false;
        let dimScore = 0;
        if (q.type === 'EI') {
          isPositiveDim = isE;
          dimScore = s.rawScores?.EI ?? (isE ? 8 : -8);
        } else if (q.type === 'SN') {
          isPositiveDim = isS;
          dimScore = s.rawScores?.SN ?? (isS ? 8 : -8);
        } else if (q.type === 'TF') {
          isPositiveDim = isT;
          dimScore = s.rawScores?.TF ?? (isT ? 8 : -8);
        } else if (q.type === 'JP') {
          isPositiveDim = isJ;
          dimScore = s.rawScores?.JP ?? (isJ ? 8 : -8);
        }

        const absScore = Math.abs(dimScore);
        let val = 0;
        if (q.direction === 1) {
          val = isPositiveDim ? (absScore >= 10 ? 2 : 1) : (absScore >= 10 ? -2 : -1);
        } else {
          val = isPositiveDim ? (absScore >= 10 ? -2 : -1) : (absScore >= 10 ? 2 : 1);
        }
        reconstructed[q.id] = val;
      });
      return reconstructed;
    };

    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    const pathname = window.location.pathname.replace(/\/+$/, '');
    const cleanAppUrl = `${origin}${pathname}`;

    const summaryData = filteredSubmissions.map((s, index) => {
      const detail = mbtiDetails[s.mbti] || { title: s.mbti, desc: 'Profil Karakteristik' };
      const webReportUrl = `${cleanAppUrl}?report=${encodeURIComponent(s.id)}`;

      return {
        No: index + 1,
        'ID Registrasi': s.id,
        'Nama Kandidat': s.name,
        'NIK / ID Karyawan': s.nik,
        Jabatan: s.position,
        'Departemen / Area': s.area,
        Email: s.email,
        'No. WhatsApp': s.whatsapp || '-',
        'Tanggal & Waktu Tes': s.formattedDate,
        'E (%)': `${s.percentages.E}%`,
        'I (%)': `${s.percentages.I}%`,
        'S (%)': `${s.percentages.S}%`,
        'N (%)': `${s.percentages.N}%`,
        'T (%)': `${s.percentages.T}%`,
        'F (%)': `${s.percentages.F}%`,
        'J (%)': `${s.percentages.J}%`,
        'P (%)': `${s.percentages.P}%`,
        'Tipe MBTI': s.mbti,
        'Sebutan Karakter': detail.title,
        'Deskripsi Karakteristik': detail.desc,
        'Link Unduhan Laporan MBTI (PDF / Web)': webReportUrl,
      };
    });

    const detailedData = filteredSubmissions.map((s, index) => {
      const candidateAnswers = getCandidateAnswers(s);
      const row: Record<string, any> = {
        No: index + 1,
        'Nama Kandidat': s.name,
        NIK: s.nik,
        Jabatan: s.position,
        Departemen: s.area,
      };

      questions.forEach((q) => {
        const val = candidateAnswers[q.id];
        let label = '0 (Netral)';
        if (val === 2) label = '+2 (Sangat Setuju)';
        else if (val === 1) label = '+1 (Setuju)';
        else if (val === -1) label = '-1 (Tidak Setuju)';
        else if (val === -2) label = '-2 (Sangat Tidak Setuju)';
        row[`Soal ${q.id} [${q.type}]`] = label;
      });

      row['Hasil MBTI'] = s.mbti;
      row['Link Laporan Hasil'] = `${cleanAppUrl}?report=${encodeURIComponent(s.id)}`;
      return row;
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsDetailed = XLSX.utils.json_to_sheet(detailedData);

    wsSummary['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 25 },
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
      { wch: 25 },
      { wch: 16 },
      { wch: 22 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 12 },
      { wch: 24 },
      { wch: 45 },
      { wch: 55 },
    ];

    const detailCols = [
      { wch: 6 },
      { wch: 24 },
      { wch: 16 },
      { wch: 20 },
      { wch: 20 },
      ...questions.map(() => ({ wch: 18 })),
      { wch: 12 },
      { wch: 55 },
    ];
    wsDetailed['!cols'] = detailCols;

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Rekapitulasi MBTI');
    XLSX.utils.book_append_sheet(wb, wsDetailed, 'Detail Jawaban Soal 1-32');

    const fileName = `DPP_MBTI_Rekapitulasi_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportPDF = () => {
    if (filteredSubmissions.length === 0) return alert('Tidak ada data untuk diexport!');

    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('PT. DIAN PANDU PRATAMA - REKAPITULASI ASESMEN MBTI', 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Tanggal Ekspor: ${new Date().toLocaleDateString('id-ID')} | Total Data: ${filteredSubmissions.length} Kandidat`,
      14,
      22
    );

    const tableData = filteredSubmissions.map((s, idx) => [
      idx + 1,
      s.name,
      s.nik,
      s.position,
      s.area,
      s.formattedDate.split(' ')[0],
      `${s.percentages.E}/${s.percentages.I}`,
      `${s.percentages.S}/${s.percentages.N}`,
      `${s.percentages.T}/${s.percentages.F}`,
      `${s.percentages.J}/${s.percentages.P}`,
      s.mbti,
      mbtiDetails[s.mbti]?.title || '-',
    ]);

    autoTable(doc, {
      startY: 28,
      head: [
        [
          'No',
          'Nama Kandidat',
          'NIK',
          'Jabatan',
          'Departemen',
          'Tanggal',
          'E/I (%)',
          'S/N (%)',
          'T/F (%)',
          'J/P (%)',
          'MBTI',
          'Sebutan Karakter',
        ],
      ],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 20 },
        6: { cellWidth: 18 },
        7: { cellWidth: 18 },
        8: { cellWidth: 18 },
        9: { cellWidth: 18 },
        10: { cellWidth: 16, fontStyle: 'bold' },
        11: { cellWidth: 40 },
      },
    });

    doc.save(`DPP_MBTI_Rekapitulasi_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-surface border border-surface-border rounded-2xl p-8 max-w-md w-full shadow-card animate-scale-up">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">Portal HR Admin</h2>
          <p className="text-xs text-text-secondary mt-1">
            PT. Dian Pandu Pratama — Akses Database & Rekapitulasi
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Kata Sandi Administrator
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-text-secondary absolute left-3 top-3" />
              <input
                type="password"
                placeholder="Masukkan kata sandi admin..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-background border border-surface-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>
            {errorMsg && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errorMsg}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-container hover:bg-surface-container-high text-text-secondary text-xs font-semibold py-2.5 rounded-xl border border-surface-border transition-all cursor-pointer"
            >
              Kembali
            </button>
            <button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs font-semibold py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
            >
              Masuk Portal
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-7xl shadow-card flex flex-col min-h-[600px] animate-scale-up">
      {/* Header */}
      <div className="p-6 border-b border-surface-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface-container/30">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">
              Portal HR Admin — Database Asesmen MBTI
            </h2>
            <p className="text-xs text-text-secondary">
              PT. Dian Pandu Pratama • Sistem Manajemen Rekapitulasi Karakter
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-wrap">
          {onRefreshFromCloud && (
            <button
              onClick={handleRefreshCloudData}
              disabled={isRefreshingCloud}
              title="Tarik data terbaru dari server cloud Firestore jika kandidat baru saja mengisi dari perangkat lain"
              className="bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold px-3 py-2 rounded-xl border border-primary/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin' : ''}`} />
              <span>{isRefreshingCloud ? 'Memuat Cloud...' : 'Refresh Cloud'}</span>
            </button>
          )}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-3.5 py-2 rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Setup Google Sheets</span>
          </button>
          <button
            onClick={onLogout}
            className="bg-surface-container hover:bg-surface-container-high text-text-secondary text-xs font-semibold px-3 py-2 rounded-xl border border-surface-border flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {cloudRefreshMsg && (
        <div className="mx-6 mt-4 p-3 bg-primary/10 border border-primary/30 rounded-xl text-xs text-primary font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{cloudRefreshMsg}</span>
        </div>
      )}

      <div className="p-6 flex-grow flex flex-col space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-container/50 border border-surface-border rounded-xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-text-secondary font-medium">Total Kandidat</div>
              <div className="text-lg font-bold text-text-primary">{totalCount}</div>
            </div>
          </div>

          <div className="bg-surface-container/50 border border-surface-border rounded-xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-text-secondary font-medium">MBTI Terbanyak</div>
              <div className="text-lg font-bold text-text-primary">
                {topMbti}{' '}
                <span className="text-xs font-normal text-text-secondary">({topCount})</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container/50 border border-surface-border rounded-xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-text-secondary font-medium">Live Google Sheets</div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {hasWebhook ? 'Tersambung (Global)' : hasOAuth ? 'Tersambung (OAuth)' : 'Tersedia'}
              </div>
            </div>
          </div>

          <div className="bg-surface-container/50 border border-surface-border rounded-xl p-4 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-text-secondary font-medium">Terakhir Diisi</div>
              <div className="text-xs font-semibold text-text-primary truncate max-w-[150px]">
                {submissions[0]?.name || 'Belum ada'}
              </div>
            </div>
          </div>
        </div>

        {/* Google Sheets Real-Time Cloud Sync Box */}
        <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-text-primary">
                  Google Sheets Live Sync (Multi-Admin & Bebas Blokir Vercel)
                </h4>
                <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  100% Gratis
                </span>
                {hasWebhook && (
                  <span className="bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Webhook Aktif (Semua Admin)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5">
                Setiap kandidat baru yang menyelesaikan tes, data otomatis masuk ke Google
                Spreadsheet tanpa perlu unduh ulang.
              </p>
              {sheetSyncStatus && (
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                  {sheetSyncStatus}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 flex-wrap">
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-initial bg-surface border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <span>Buka Google Sheet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {hasWebhook && (
              <button
                disabled={isSyncingSheet}
                onClick={handleSyncAllWebhook}
                className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                <span>Kirim Semua Data</span>
              </button>
            )}

            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex-1 sm:flex-initial bg-surface border border-surface-border hover:bg-surface-container text-text-primary text-xs font-semibold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-text-secondary" />
              <span>Pengaturan Sheet</span>
            </button>
          </div>
        </div>

        {/* Search, Filter, & Export Actions */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cari nama, NIK, jabatan, atau MBTI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-surface-border rounded-xl pl-9 pr-4 py-2 text-xs text-text-primary focus:outline-none focus:border-primary"
              />
            </div>

            <select
              value={mbtiFilter}
              onChange={(e) => setMbtiFilter(e.target.value)}
              className="bg-background border border-surface-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="ALL">Semua MBTI</option>
              {[
                'ISTJ',
                'ISFJ',
                'INFJ',
                'INTJ',
                'ISTP',
                'ISFP',
                'INFP',
                'INTP',
                'ESTP',
                'ESFP',
                'ENFP',
                'ENTP',
                'ESTJ',
                'ESFJ',
                'ENFJ',
                'ENTJ',
              ].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {totalCount === 0 && (
              <button
                onClick={onAddSampleData}
                className="bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold px-3 py-2 rounded-xl border border-surface-border flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Data Demo</span>
              </button>
            )}

            <button
              onClick={exportExcel}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={exportPDF}
              className="bg-surface-container hover:bg-surface-container-high text-text-primary border border-surface-border text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Registry Data Table */}
        <div className="bg-background border border-surface-border rounded-xl overflow-hidden flex-grow flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-text-primary">
              <thead className="bg-surface-container/60 border-b border-surface-border font-semibold text-text-secondary uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No</th>
                  <th className="py-3 px-4">Nama Kandidat</th>
                  <th className="py-3 px-4">NIK</th>
                  <th className="py-3 px-4">Jabatan</th>
                  <th className="py-3 px-4">Departemen / Area</th>
                  <th className="py-3 px-4">Tanggal Tes</th>
                  <th className="py-3 px-4">MBTI</th>
                  <th className="py-3 px-4">Karakter</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-text-secondary text-xs">
                      Tidak ada data kandidat yang cocok dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub, idx) => {
                    const detail = mbtiDetails[sub.mbti] || { title: sub.mbti };
                    return (
                      <tr
                        key={sub.id}
                        className="hover:bg-surface-container/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-[11px] text-text-secondary">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-bold text-text-primary">
                          {sub.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-text-secondary">
                          {sub.nik}
                        </td>
                        <td className="py-3 px-4">{sub.position}</td>
                        <td className="py-3 px-4">{sub.area}</td>
                        <td className="py-3 px-4 text-text-secondary">
                          {sub.formattedDate.split(' ')[0]}
                        </td>
                        <td className="py-3 px-4">
                          <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded font-mono text-[11px]">
                            {sub.mbti}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-secondary truncate max-w-[140px]">
                          {detail.title}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => onSelectSubmission(sub)}
                              title="Lihat Detail Hasil & Download Laporan"
                              className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `Apakah Anda yakin ingin menghapus data asesmen atas nama ${sub.name}?`
                                  )
                                ) {
                                  onDeleteSubmission(sub.id);
                                }
                              }}
                              title="Hapus Data"
                              className="p-1.5 rounded-lg bg-surface-container hover:bg-red-500/10 text-text-secondary hover:text-red-500 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Settings Modal (Google Sheets Sync Hub) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-surface border border-surface-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-border pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary">
                    Integrasi Google Sheets (Multi-Admin & Bebas Blokir)
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Pilih metode sinkronisasi otomatis agar dapat diakses oleh semua email admin di Vercel.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex border-b border-surface-border gap-2">
              <button
                onClick={() => setActiveTab('webhook')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'webhook'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Google Apps Script (Rekomendasi Utama)</span>
              </button>
              <button
                onClick={() => setActiveTab('oauth')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'oauth'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Google OAuth 2.0</span>
              </button>
            </div>

            {/* TAB 1: WEBHOOK (RECOMMENDED) */}
            {activeTab === 'webhook' && (
              <div className="space-y-4 text-xs">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-text-primary">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span>Keuntungan Metode Google Apps Script:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-text-secondary text-[11px]">
                    <li>
                      <strong>100% Bebas Blokir:</strong> Dibuat di akun Google apapun tanpa batasan domain atau status *unverified app*.
                    </li>
                    <li>
                      <strong>Multi-Admin Global:</strong> Cukup 1 admin menyetting, SEMUA admin lain di Vercel otomatis tersambung ke Sheet yang sama!
                    </li>
                    <li>
                      <strong>Gratis Selamanya:</strong> Tanpa biaya langganan API atau kuota berbayar.
                    </li>
                  </ul>
                </div>

                <div className="space-y-3 bg-surface-container/40 p-4 rounded-xl border border-surface-border">
                  <h4 className="font-bold text-text-primary flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center">
                      1
                    </span>
                    <span>Salin Kode Script</span>
                  </h4>
                  <p className="text-text-secondary text-[11px]">
                    Buka Google Sheet baru di akun Google Anda &gt; Menu <strong>Ekstensi (Extensions)</strong> &gt; <strong>Apps Script</strong>. Hapus isi bawaan lalu tempel kode ini:
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyScript}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Tersalin ke Clipboard!' : 'Salin Kode Google Apps Script'}</span>
                    </button>
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-surface border border-surface-border hover:bg-surface-container text-text-primary text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span>Buka Google Sheet Baru</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="space-y-3 bg-surface-container/40 p-4 rounded-xl border border-surface-border">
                  <h4 className="font-bold text-text-primary flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center">
                      2
                    </span>
                    <span>Deploy as Web App &amp; Masukkan URL</span>
                  </h4>
                  <p className="text-text-secondary text-[11px]">
                    Di Apps Script: Klik tombol <strong>Deploy (Terapkan) &gt; New deployment &gt; Pilih 'Web app'</strong>. Pastikan <em>'Who has access' (Siapa yang memiliki akses)</em> diset ke <strong>'Anyone' (Siapa saja)</strong>. Lalu salin URL Web app tersebut ke bawah:
                  </p>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Web App URL Google Apps Script:
                      </label>
                      <input
                        type="url"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        value={webhookInput}
                        onChange={(e) => setWebhookInput(e.target.value)}
                        className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-text-primary mb-1">
                        Link URL Google Sheet Anda (Opsional):
                      </label>
                      <input
                        type="url"
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                        value={customSheetUrlInput}
                        onChange={(e) => setCustomSheetUrlInput(e.target.value)}
                        className="w-full bg-background border border-surface-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    disabled={isSyncingSheet}
                    onClick={handleSaveWebhook}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                    <span>Simpan &amp; Sinkronkan Semua Data</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: OAUTH */}
            {activeTab === 'oauth' && (
              <div className="space-y-4 text-xs">
                <div className="bg-surface-container/40 p-4 rounded-xl border border-surface-border space-y-3">
                  <h4 className="font-bold text-text-primary">Google OAuth 2.0 (Login Akun Google)</h4>
                  <p className="text-text-secondary text-[11px]">
                    Metode ini mengizinkan aplikasi membuat file Google Sheet langsung di Google Drive Anda. Setiap admin dapat login dengan akun Google masing-masing:
                  </p>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button
                      disabled={isSyncingSheet}
                      onClick={() => handleSyncGoogleOAuth(true)}
                      className="bg-primary hover:bg-primary/90 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>{hasOAuth ? 'Pilih / Ganti Akun Google Lain' : 'Login Akun Google'}</span>
                    </button>

                    {hasOAuth && (
                      <button
                        onClick={handleLogoutGoogle}
                        className="bg-surface border border-surface-border hover:bg-red-500/10 text-red-500 text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        <span>Keluar Akun Google</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-text-primary text-[11px] space-y-1">
                  <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Catatan Deployment Vercel:</span>
                  </div>
                  <p className="text-text-secondary">
                    Jika domain Vercel Anda belum didaftarkan di <em>Google Cloud Console OAuth Authorized Origins</em> atau jika akun Google diblokir dengan pesan <em>"Access Blocked"</em>, silakan gunakan tab <strong>Google Apps Script</strong> di atas yang dijamin 100% bebas blokir untuk semua email admin.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
