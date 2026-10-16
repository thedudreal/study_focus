import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Today = lazy(() => import("./pages/Today.tsx"));
const Ranking = lazy(() => import("./pages/Ranking.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Questions = lazy(() => import("./pages/Questions.tsx"));
const ExamDetail = lazy(() => import("./pages/ExamDetail.tsx"));
const CreateSession = lazy(() => import("./pages/CreateSession.tsx"));
const SessionPlayer = lazy(() => import("./pages/SessionPlayer.tsx"));
const Results = lazy(() => import("./pages/Results.tsx"));
const History = lazy(() => import("./pages/History.tsx"));
const Favorites = lazy(() => import("./pages/Favorites.tsx"));
const Errors = lazy(() => import("./pages/Errors.tsx"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.tsx"));
const AdminQuestions = lazy(() => import("./pages/admin/AdminQuestions.tsx"));
const AdminQuestionForm = lazy(() => import("./pages/admin/AdminQuestionForm.tsx"));
const AdminImport = lazy(() => import("./pages/admin/AdminImport.tsx"));
const AdminExamImport = lazy(() => import("./pages/admin/AdminExamImport.tsx"));
const AdminContributions = lazy(() => import("./pages/admin/AdminContributions.tsx"));
const ContributeExam = lazy(() => import("./pages/ContributeExam.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground font-mono-tech text-sm">carregando…</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

/** Wrapper: rota autenticada dentro do shell StudyFocus */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth redirectImmediately>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/app" />}
              />
              <Route path="/app" element={<Protected><Dashboard /></Protected>} />
              <Route path="/app/questions" element={<Protected><Questions /></Protected>} />
              <Route path="/app/questions/create" element={<Protected><CreateSession /></Protected>} />
              <Route path="/app/questions/search" element={<Protected><Questions /></Protected>} />
              <Route path="/app/questions/errors" element={<Protected><Errors /></Protected>} />
              <Route path="/app/questions/favorites" element={<Protected><Favorites /></Protected>} />
              <Route path="/app/questions/contribute" element={<Protected><ContributeExam /></Protected>} />
              <Route path="/app/exams/:examId" element={<Protected><ExamDetail /></Protected>} />
              <Route path="/app/session/:sessionId" element={<Protected><SessionPlayer /></Protected>} />
              <Route path="/app/results/:sessionId" element={<Protected><Results /></Protected>} />
              <Route path="/app/history" element={<Protected><History /></Protected>} />
              <Route path="/app/today" element={<Protected><Today /></Protected>} />
              <Route path="/app/ranking" element={<Protected><Ranking /></Protected>} />
              <Route path="/app/profile" element={<Protected><Profile /></Protected>} />
              <Route
                path="/app/admin"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminQuestions />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route
                path="/app/admin/import"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminImport />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route
                path="/app/admin/import-exams"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminExamImport />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route
                path="/app/admin/contributions"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminContributions />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route
                path="/app/admin/questions/new"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminQuestionForm />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route
                path="/app/admin/questions/:questionId"
                element={
                  <Protected>
                    <AdminLayout>
                      <AdminQuestionForm />
                    </AdminLayout>
                  </Protected>
                }
              />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
