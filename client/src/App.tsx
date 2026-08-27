import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useRoute } from "wouter";
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
import SupplyGovernance from "./pages/SupplyGovernance";
import SupplierCorrectiveAction from "./pages/SupplierCorrectiveAction";
import PatientSign from "./pages/PatientSign";
import PatientHistory from "./pages/PatientHistory";
import EvidenceFreshness from "./pages/EvidenceFreshness";
import Login from "./pages/Login";

function Router() {
  const [isSupplierResponseRoute] = useRoute("/supplier-action/:token");
  const [isPatientSigningRoute] = useRoute("/patient-sign/:token");
  const [isLoginRoute] = useRoute("/login");
  if (isSupplierResponseRoute) return <SupplierCorrectiveAction />;
  if (isPatientSigningRoute) return <PatientSign />;
  if (isLoginRoute) return <Login />;
  return <AppShell><Switch><Route path="/treatment-map/:id" component={TreatmentMap} /><Route path="/review/:id" component={ReviewConsent} /><Route path="/patients/:id" component={PatientHistory} /><Route path="/evidence-freshness" component={EvidenceFreshness} /><Route path="/" component={Home} /><Route path="/create" component={CreateConsent} /><Route path="/templates" component={Templates} /><Route path="/catalogue" component={MarketCatalogue} /><Route path="/supply-governance" component={SupplyGovernance} /><Route path="/records" component={Records} /><Route path="/profile" component={Profile} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></AppShell>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
