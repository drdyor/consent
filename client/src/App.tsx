import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { AppShell } from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Templates from "./pages/Templates";
import CreateConsent from "./pages/CreateConsent";
import ReviewConsent from "./pages/ReviewConsent";
import Records from "./pages/Records";
import TreatmentMap from "./pages/TreatmentMap";
import MarketCatalogue from "./pages/MarketCatalogue";

function Router() {
  return <AppShell><Switch><Route path="/treatment-map/:id" component={TreatmentMap} /><Route path="/review/:id" component={ReviewConsent} /><Route path="/" component={Home} /><Route path="/create" component={CreateConsent} /><Route path="/templates" component={Templates} /><Route path="/catalogue" component={MarketCatalogue} /><Route path="/records" component={Records} /><Route path="/profile" component={Profile} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></AppShell>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
