import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
import { ApiError } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { I18nProvider, loadDict, read } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

/** Limits shown on the page refresh by themselves after anything is created (no page reload needed). */
const refreshLimits = () => {
  for (const key of ["subscription", "dashboard", "profile"]) void queryClient.invalidateQueries({ queryKey: [key] });
};
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({ onSettled: refreshLimits }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Load the dictionary of the saved language before the first render (falls back to English on error).
void loadDict(read()).catch(() => {}).finally(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
));
