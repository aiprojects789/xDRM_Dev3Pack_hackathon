import React from 'react'
import Navbar from '../components/Navbar'
import Auth from '../pages/Auth'
import PaymentCancel from '../components/PaymentCancel'
import { AuthProvider } from '../context/AuthContext'
import { Web3Provider } from '../context/Web3Context'
import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'
import AboutUs from '../pages/About'
import Faqs from '../pages/Faqs'
import Contact from '../pages/Contact'
import Explorer from '../pages/Explorer'
import MainLayout from './Layout'
import ArtistDash from '../pages/dashboard/ArtistDash/ArtistDash'
import UploadArtworks from '../pages/dashboard/ArtistDash/UploadArtworks'
import MyArtworks from '../pages/dashboard/ArtistDash/MyArtworks'
import Licenses from '../pages/dashboard/ArtistDash/Licenses'
import Piracy from '../pages/dashboard/ArtistDash/Piracy'
import Wallets from '../pages/dashboard/ArtistDash/Wallet'
import Settings from '../pages/dashboard/ArtistDash/Settings'
import DashboardHome from '../pages/dashboard/ArtistDash/DashboardHome'
// import PSLTicketPortal from '../pages/dashboard/ArtistDash/PSLTicketPortal'  // PSL Hackathon
// import GateScanner from '../pages/dashboard/ArtistDash/GateScanner'  // PSL Hackathon Scanner

// Admin imports removed as per user request to delete admin section
import LicensesPage from '../pages/LicensesPage';
import ScrollRestore from '../components/ScrollRestore'
import ProtectedRoute from './ProtectedRoutes'
import SalePage from '../pages/SalePage'
import LicensePage from '../pages/LicensePage'
import ArtworkDetail from '../pages/ArtworkDetail'
import OAuthCallback from '../pages/OAuthCallback';
import ArtworkProtection from '../pages/ArtworkProtection';
import LicensingSystem from '../pages/LicensingSystem';
import PiracyDetection from '../pages/PiracyDetection';
import Pricing from '../pages/Pricing';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import TermsOfService from '../pages/TermsOfService';
import CopyrightPolicy from '../pages/CopyrightPolicy';
import CompleteProfile from '../pages/CompleteProfile';
// Blog imports removed as per user request to delete blogs section
import { useParams, Navigate } from 'react-router-dom';

const ShareRedirect = () => {
    const { artworkId } = useParams();
    return <Navigate to={`/artwork/${artworkId}`} replace />;
};

const AppRoutes = () => {
    return (
        <>
            <ScrollRestore />
            <Routes>
                {/* All routes now use MainLayout for consistent navbar/footer */}
                <Route path="/" element={<MainLayout />}>
                    {/* Public routes */}
                    <Route index element={<Home />} />
                    <Route path="auth" element={<Auth />} />
                    <Route path="about" element={<AboutUs />} />
                    <Route path="faqs" element={<Faqs />} />
                    <Route path="contact" element={<Contact />} />
                    <Route path="explorer" element={<Explorer />} />
                    <Route path="artwork-protection" element={<ArtworkProtection />} />
                    <Route path="licensing-system" element={<LicensingSystem />} />
                    <Route path="piracy-detection" element={<PiracyDetection />} />
                    <Route path="pricing" element={<Pricing />} />
                    <Route path="privacy" element={<PrivacyPolicy />} />
                    <Route path="terms-of-service" element={<TermsOfService />} />
                    <Route path="copyright-policy" element={<CopyrightPolicy />} />
                    <Route path="sale/:artworkId" element={<SalePage />} />
                    <Route path="license/:artworkId" element={<LicensePage />} />
                    <Route path="artwork/:artworkId" element={<ArtworkDetail />} />
                    <Route path="/licenses" element={<LicensesPage />} />
                    <Route path="/payment/cancel" element={<PaymentCancel />} />
                    <Route path="/complete-profile" element={<CompleteProfile />} />
                    <Route path="/auth/callback" element={<OAuthCallback />} />
                    <Route path="/share/:artworkId" element={<ShareRedirect />} />
                    {/* Blog routes removed */}
                    {/* <Route path="/settings" element={<Settings />} /> */}
                    {/* <Route path="/paypal/oauth-callback" element={<PayPalOAuthCallback />} /> */}

                    {/* User Dashboard routes with MainLayout */}
                    <Route 
                        path="dashboard" 
                        element={
                            <ProtectedRoute>
                                <ArtistDash />
                            </ProtectedRoute>
                        }
                    >
                        {/* Default dashboard route - redirects to dashboard home */}
                        <Route index element={<DashboardHome />} />
                        <Route path="home" element={<DashboardHome />} />
                        <Route path="upload" element={<UploadArtworks />} />
                        <Route path="artworks" element={<MyArtworks />} />
                        <Route path="licenses" element={<Licenses />} />
                        <Route path="piracy" element={<Piracy />} />
                        <Route path="wallet" element={<Wallets />} />
                        <Route path="settings" element={<Settings />} />
                        {/* <Route path="psl-tickets" element={<PSLTicketPortal />} />
                        <Route path="gate-scanner" element={<GateScanner />} /> */}

                    </Route>
                    
                    {/* Admin Dashboard routes removed */}
                </Route>
            </Routes>
        </>
    )
}

export default AppRoutes