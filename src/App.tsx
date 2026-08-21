import React, { useState, useEffect, useRef } from 'react';
import { CandidateData, AssessmentSubmission } from './types';
import { questions } from './data/questions';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { WelcomeScreen } from './components/WelcomeScreen';
import { TestScreen } from './components/TestScreen';
import { ResultScreen } from './components/ResultScreen';
import { CompletionScreen } from './components/CompletionScreen';
import { AdminScreen } from './components/AdminScreen';
import {
  saveSubmissionToFirestore,
  deleteSubmissionFromFirestore,
  subscribeToSubmissions,
  getSubmissionById,
  subscribeToGoogleSheetSettings,
} from './lib/firebase';
import {
  getStoredAccessToken,
  getStoredSpreadsheetId,
  setStoredSpreadsheetId,
  getStoredWebhookUrl,
  setStoredWebhookUrl,
  setStoredSpreadsheetUrl,
  appendSubmissionToGoogleSheet,
  sendSubmissionToWebhook,
} from './lib/googleSheets';

export default function App() {
  const [step, setStep] = useState<'welcome' | 'test' | 'completed' | 'result' | 'admin'>('welcome');
  const [candidateData, setCandidateData] = useState<CandidateData>({
    name: '',
    nik: '',
    position: '',
    area: '',
    email: '',
    whatsapp: '',
  });

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [activeSubmission, setActiveSubmission] = useState<AssessmentSubmission | null>(null);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>(() => {
    const cached = localStorage.getItem('dpp_mbti_submissions');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
    return [];
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [isViewedFromAdmin, setIsViewedFromAdmin] = useState<boolean>(false);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('report') || params.get('resultId') || params.get('id'));
  });
  const [reportError, setReportError] = useState<string | null>(null);

  const answersRef = useRef<Record<number, number>>({});

  // Check URL parameters for direct deep-linking from Excel download link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report') || params.get('resultId') || params.get('id');
    if (!reportId) return;

    // Check if already in submissions list
    if (submissions.length > 0) {
      const found = submissions.find((s) => s.id === reportId);
      if (found) {
        setActiveSubmission(found);
        setIsViewedFromAdmin(true);
        setStep('result');
        setIsLoadingReport(false);
        return;
      }
    }

    // Fetch directly from Firestore by ID if not in memory
    let isMounted = true;
    getSubmissionById(reportId)
      .then((docData) => {
        if (!isMounted) return;
        if (docData) {
          setActiveSubmission(docData);
          setIsViewedFromAdmin(true);
          setStep('result');
          setReportError(null);
        } else {
          // If not found in Firestore, check localStorage cache
          const cached = localStorage.getItem('dpp_mbti_submissions');
          if (cached) {
            try {
              const list: AssessmentSubmission[] = JSON.parse(cached);
              const found = list.find((s) => s.id === reportId);
              if (found) {
                setActiveSubmission(found);
                setIsViewedFromAdmin(true);
                setStep('result');
                setReportError(null);
                setIsLoadingReport(false);
                return;
              }
            } catch (_) {}
          }
          setReportError(`Laporan dengan ID "${reportId}" tidak ditemukan atau telah dihapus.`);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch submission by ID:', err);
        if (isMounted) {
          setReportError(`Gagal memuat laporan (${err.message || 'Koneksi bermasalah'}).`);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingReport(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [submissions]);

  // Real-time synchronization with Firebase Firestore & Google Sheets global config
  useEffect(() => {
    const unsubSubmissions = subscribeToSubmissions(
      (firestoreData) => {
        setSubmissions(firestoreData);
        localStorage.setItem('dpp_mbti_submissions', JSON.stringify(firestoreData));
      },
      (err) => {
        console.warn('Falling back to local storage due to Firestore sync error:', err);
        const cached = localStorage.getItem('dpp_mbti_submissions');
        if (cached) {
          try {
            setSubmissions(JSON.parse(cached));
          } catch (_) {}
        }
      }
    );

    const unsubSettings = subscribeToGoogleSheetSettings((settings) => {
      if (settings.webhookUrl) {
        setStoredWebhookUrl(settings.webhookUrl);
      }
      if (settings.spreadsheetUrl) {
        setStoredSpreadsheetUrl(settings.spreadsheetUrl);
      }
      if (settings.spreadsheetId) {
        setStoredSpreadsheetId(settings.spreadsheetId);
      }
    });

    return () => {
      unsubSubmissions();
      unsubSettings();
    };
  }, []);

  // Save submission to Firestore and automatically sync to Google Sheets (Webhook or OAuth)
  const saveSubmission = async (newSub: AssessmentSubmission) => {
    try {
      await saveSubmissionToFirestore(newSub);
    } catch (e) {
      console.error('Failed to save submission to Firestore:', e);
      // Fallback local state update
      const updated = [newSub, ...submissions.filter((s) => s.id !== newSub.id)];
      setSubmissions(updated);
      localStorage.setItem('dpp_mbti_submissions', JSON.stringify(updated));
    }

    // 1. Auto-append via Google Apps Script Webhook (Works 100% on Vercel, zero auth block, for all emails)
    const webhookUrl = getStoredWebhookUrl();
    if (webhookUrl) {
      sendSubmissionToWebhook(webhookUrl, newSub, submissions.length + 1).catch((err) => {
        console.warn('Silent Google Sheet Webhook auto-append note:', err);
      });
    }

    // 2. Auto-append via Google OAuth API (if authenticated on this browser)
    const sheetId = getStoredSpreadsheetId();
    const token = getStoredAccessToken();
    if (sheetId && token) {
      appendSubmissionToGoogleSheet(token, sheetId, newSub, submissions.length + 1).catch((err) => {
        console.warn('Silent Google Sheet OAuth auto-append note:', err);
      });
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    try {
      await deleteSubmissionFromFirestore(id);
    } catch (e) {
      console.error('Failed to delete submission from Firestore:', e);
      const updated = submissions.filter((s) => s.id !== id);
      setSubmissions(updated);
      localStorage.setItem('dpp_mbti_submissions', JSON.stringify(updated));
    }
  };

  const handleStartTest = (data: CandidateData) => {
    setCandidateData(data);
    setAnswers({});
    answersRef.current = {};
    setCurrentQIndex(0);
    setStep('test');
  };

  const handleAnswerSelect = (score: number) => {
    const qId = questions[currentQIndex].id;
    answersRef.current = { ...answersRef.current, [qId]: score };
    setAnswers({ ...answersRef.current });

    if (currentQIndex < questions.length - 1) {
      setTimeout(() => {
        setCurrentQIndex((prev) => prev + 1);
      }, 250);
    }
  };

  const handleCalculateResult = () => {
    const currentAnswers = answersRef.current;
    const unanswered = questions.filter((q) => currentAnswers[q.id] === undefined);

    if (unanswered.length > 0) {
      alert(`Masih terdapat ${unanswered.length} pertanyaan yang belum dijawab. Anda akan diarahkan ke pertanyaan teratas yang belum diisi.`);
      const firstUnansweredIndex = questions.findIndex((q) => currentAnswers[q.id] === undefined);
      if (firstUnansweredIndex !== -1) {
        setCurrentQIndex(firstUnansweredIndex);
      }
      return;
    }

    // Calculate Scores for E-I, S-N, T-F, J-P
    let rawScores = { EI: 0, SN: 0, TF: 0, JP: 0 };
    questions.forEach((q) => {
      const val = currentAnswers[q.id] || 0;
      rawScores[q.type] += val * q.direction;
    });

    // Score range per dimension is -16 to +16. Convert to 0-100 percentage.
    const getPct = (score: number) => Math.min(100, Math.max(0, Math.round(((score + 16) / 32) * 100)));

    const eiPct = getPct(rawScores.EI);
    const snPct = getPct(rawScores.SN);
    const tfPct = getPct(rawScores.TF);
    const jpPct = getPct(rawScores.JP);

    const mbtiCode = [
      eiPct >= 50 ? 'E' : 'I',
      snPct >= 50 ? 'S' : 'N',
      tfPct >= 50 ? 'T' : 'F',
      jpPct >= 50 ? 'J' : 'P',
    ].join('');

    const newSub: AssessmentSubmission = {
      id: 'SUB-' + Date.now().toString(36).toUpperCase(),
      name: candidateData.name,
      nik: candidateData.nik,
      position: candidateData.position,
      area: candidateData.area,
      email: candidateData.email,
      whatsapp: candidateData.whatsapp,
      mbti: mbtiCode,
      rawScores,
      percentages: {
        E: eiPct,
        I: 100 - eiPct,
        S: snPct,
        N: 100 - snPct,
        T: tfPct,
        F: 100 - tfPct,
        J: jpPct,
        P: 100 - jpPct,
      },
      answers: { ...currentAnswers },
      timestamp: Date.now(),
      formattedDate: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    saveSubmission(newSub);
    setActiveSubmission(newSub);
    setIsViewedFromAdmin(false);
    setStep('completed');
  };

  const handleAddSampleData = () => {
    const generateSampleAnswers = (mbti: string): Record<number, number> => {
      const ans: Record<number, number> = {};
      const isE = mbti[0] === 'E';
      const isS = mbti[1] === 'S';
      const isT = mbti[2] === 'T';
      const isJ = mbti[3] === 'J';

      questions.forEach((q) => {
        let desiredPositive = false;
        if (q.type === 'EI') desiredPositive = isE;
        else if (q.type === 'SN') desiredPositive = isS;
        else if (q.type === 'TF') desiredPositive = isT;
        else if (q.type === 'JP') desiredPositive = isJ;

        const sign = desiredPositive ? q.direction : -q.direction;
        ans[q.id] = sign * 2;
      });
      return ans;
    };

    const sampleCandidates: AssessmentSubmission[] = [
      {
        id: 'SUB-SAMPLE-1',
        name: 'Dian Pandu Pratama',
        nik: 'DPP-2024-001',
        position: 'General Manager',
        area: 'Corporate Management',
        email: 'dian.pandu@dianpandupratama.co.id',
        whatsapp: '081234567890',
        mbti: 'ENTJ',
        rawScores: { EI: 12, SN: -8, TF: 10, JP: 14 },
        percentages: { E: 88, I: 12, S: 25, N: 75, T: 81, F: 19, J: 94, P: 6 },
        answers: generateSampleAnswers('ENTJ'),
        timestamp: Date.now() - 3600000 * 24,
        formattedDate: '12 Agustus 2026, 10:30 WIB',
      },
      {
        id: 'SUB-SAMPLE-2',
        name: 'Budi Santoso',
        nik: 'DPP-2024-042',
        position: 'Supervisor Maintenance',
        area: 'Operasional Lapangan',
        email: 'budi.santoso@dianpandupratama.co.id',
        whatsapp: '081398765432',
        mbti: 'ISTJ',
        rawScores: { EI: -10, SN: 12, TF: 8, JP: 12 },
        percentages: { E: 19, I: 81, S: 88, N: 12, T: 75, F: 25, J: 88, P: 12 },
        answers: generateSampleAnswers('ISTJ'),
        timestamp: Date.now() - 3600000 * 48,
        formattedDate: '11 Agustus 2026, 14:15 WIB',
      },
      {
        id: 'SUB-SAMPLE-3',
        name: 'Siti Rahmawati',
        nik: 'DPP-2024-088',
        position: 'HRD & Talent Specialist',
        area: 'Human Capital',
        email: 'siti.rahma@dianpandupratama.co.id',
        whatsapp: '081567891234',
        mbti: 'ENFJ',
        rawScores: { EI: 10, SN: -6, TF: -12, JP: 8 },
        percentages: { E: 81, I: 19, S: 31, N: 69, T: 12, F: 88, J: 75, P: 25 },
        answers: generateSampleAnswers('ENFJ'),
        timestamp: Date.now() - 3600000 * 72,
        formattedDate: '10 Agustus 2026, 09:00 WIB',
      },
    ];

    sampleCandidates.forEach((s) => saveSubmission(s));
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-text-primary selection:bg-primary/30 selection:text-primary">
      <Header
        currentStep={step}
        onHomeClick={() => setStep('welcome')}
        onAdminToggle={() => setStep(step === 'admin' ? 'welcome' : 'admin')}
      />

      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {isLoadingReport && (
          <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg animate-fade-in">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-base font-bold text-text-primary mb-1">Memuat Laporan Hasil MBTI...</h3>
            <p className="text-xs text-text-secondary">
              Sedang mengambil data rekam asesmen resmi dari cloud server PT. Dian Pandu Pratama.
            </p>
          </div>
        )}

        {!isLoadingReport && reportError && (
          <div className="bg-surface border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-lg animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold">!</span>
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1">Laporan Belum Ditemukan</h3>
            <p className="text-xs text-text-secondary mb-6">{reportError}</p>
            <button
              onClick={() => {
                setReportError(null);
                window.history.replaceState({}, '', window.location.pathname);
                setStep('welcome');
              }}
              className="bg-primary hover:bg-primary/90 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

        {!isLoadingReport && !reportError && step === 'welcome' && (
          <WelcomeScreen
            onSubmit={handleStartTest}
            initialData={candidateData}
          />
        )}

        {!isLoadingReport && !reportError && step === 'test' && (
          <TestScreen
            questions={questions}
            currentQIndex={currentQIndex}
            answers={answers}
            onAnswer={handleAnswerSelect}
            onPrev={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
            onJumpToQuestion={(idx) => setCurrentQIndex(idx)}
            onCalculateResult={handleCalculateResult}
          />
        )}

        {!isLoadingReport && !reportError && step === 'completed' && activeSubmission && (
          <CompletionScreen
            submission={activeSubmission}
            onReset={() => {
              setActiveSubmission(null);
              setAnswers({});
              answersRef.current = {};
              setCurrentQIndex(0);
              setCandidateData({
                name: '',
                nik: '',
                position: '',
                area: '',
                email: '',
                whatsapp: '',
              });
              setStep('welcome');
            }}
          />
        )}

        {!isLoadingReport && !reportError && step === 'result' && activeSubmission && (
          <ResultScreen
            submission={activeSubmission}
            isFromAdmin={isViewedFromAdmin}
            onBackToAdmin={() => {
              setStep('admin');
            }}
            onReset={() => {
              setIsViewedFromAdmin(false);
              setStep('welcome');
            }}
          />
        )}

        {!isLoadingReport && !reportError && step === 'admin' && (
          <AdminScreen
            submissions={submissions}
            isAuthenticated={isAdminAuthenticated}
            onLoginSuccess={() => setIsAdminAuthenticated(true)}
            onLogout={() => setIsAdminAuthenticated(false)}
            onSelectSubmission={(sub) => {
              setActiveSubmission(sub);
              setIsViewedFromAdmin(true);
              setStep('result');
            }}
            onDeleteSubmission={handleDeleteSubmission}
            onAddSampleData={handleAddSampleData}
            onClose={() => setStep('welcome')}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
