import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@mui/material";
import WalletButton from "./WalletButton";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";

const Navbar = () => {
  const { isAuthenticated, isInitialized, logout, user } = useAuth();
  const { connected, account } = useWeb3();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  // Debug authentication state
  useEffect(() => {
    console.log("Navbar Auth State:", {
      isInitialized,
      isAuthenticated,
      connected,
      account: account ? `${account.substring(0, 6)}...` : null,
    });
  }, [isInitialized, isAuthenticated, connected, account]);

  // Show wallet button condition: user is authenticated OR wallet is connected
  const shouldShowWalletButton = isAuthenticated || connected;

  if (!isInitialized) {
    return (
      <nav className="bg-white shadow-sm sticky top-0 z-50 py-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex items-center">
                <img src="/logo.png" alt="" className="w-20 ms-1" />
              </Link>
            </div>
            {/* Show loading state */}
            <div className="flex items-center">
              <div className="animate-pulse bg-gray-200 h-8 w-20 rounded"></div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50 py-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side logo + nav */}
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <img src="/logo.png" alt="" className="w-20 ms-1" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-10 md:flex md:space-x-4 lg:space-x-8">
              <Link
                to="/"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  isActive("/")
                    ? "border-blue-800 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                Home
              </Link>
              <Link
                to="/about"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  isActive("/about")
                    ? "border-blue-800 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                About
              </Link>
              <Link
                to="/contact"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  isActive("/contact")
                    ? "border-blue-800 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                Contact
              </Link>
              <Link
                to="/faqs"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  isActive("/faqs")
                    ? "border-blue-800 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                Faqs
              </Link>
              <Link
                to="/explorer"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                  isActive("/explorer")
                    ? "border-blue-800 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                Explorer
              </Link>
            </div>
          </div>

          {/* Right side buttons (Desktop) */}
          <div className="hidden md:flex md:items-center md:space-x-4">

            {/* Wrap wallet button so dropdown shows on top - only show when authenticated */}
            {isAuthenticated && (
              <div className="relative z-[9999]">
                <WalletButton />
              </div>
            )}

            {isAuthenticated ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Link to="/dashboard" style={{ textDecoration: "none" }}>
                  <Button variant="outlined" color="secondary" size="small">
                    Dashboard
                  </Button>
                </Link>

                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <Link to="/auth" style={{ textDecoration: "none" }}>
                <Button variant="contained" color="secondary" size="small">
                  Sign In
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/"
              className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                isActive("/")
                  ? "border-blue-800 text-blue-800 bg-blue-50"
                  : "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
              }`}
              onClick={closeMenu}
            >
              Home
            </Link>
            <Link
              to="/about"
              className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                isActive("/about")
                  ? "border-blue-800 text-blue-800 bg-blue-50"
                  : "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
              }`}
              onClick={closeMenu}
            >
              About
            </Link>
            <Link
              to="/contact"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
              onClick={closeMenu}
            >
              Contact
            </Link>
            <Link
              to="/faqs"
              className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                isActive("/faqs")
                  ? "border-blue-800 text-blue-800 bg-blue-50"
                  : "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
              }`}
              onClick={closeMenu}
            >
              Faqs
            </Link>
            <Link
              to="/explorer"
              className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                isActive("/explorer")
                  ? "border-blue-800 text-blue-800 bg-blue-50"
                  : "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
              }`}
              onClick={closeMenu}
            >
              Explorer
            </Link>
          </div>

          {/* Mobile Auth Buttons */}
          <div className="pt-4 pb-3 border-t border-gray-200 px-4 space-y-2">

            {/* Show WalletButton in mobile - only when authenticated */}
            {isAuthenticated && (
              <div className="py-2">
                <WalletButton />
              </div>
            )}

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  style={{ textDecoration: "none" }}
                  onClick={() => {
                    console.log("Dashboard clicked - Auth State:", {
                      isAuthenticated,
                      isInitialized,
                      userRole: user?.role,
                    });
                  }}
                >
                  <Button variant="outlined" color="secondary" size="small">
                    Dashboard
                  </Button>
                </Link>
                <Button
                  variant="contained"
                  color="error"
                  fullWidth
                  onClick={() => {
                    closeMenu();
                    handleLogout();
                  }}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Link to="/auth" onClick={closeMenu}>
                <Button variant="contained" color="secondary" fullWidth>
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
