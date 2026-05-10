import React from 'react';
import { Link } from 'react-router-dom';

const Footer= () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-1">
            <h2 className="text-lg font-bold mb-4">xDRM</h2>
            <p className="text-gray-400 mb-4">
              Empowering ethical creators with blockchain-powered DRM to protect their digital rights.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 tracking-wider uppercase mb-4">
              Product
            </h3>
            <ul className="space-y-2">
              <li>
                <Link to="/artwork-protection" className="text-gray-400 hover:text-white">
                  Artwork Protection
                </Link>
              </li>
              <li>
                <Link to="/licensing-system" className="text-gray-400 hover:text-white">
                  Licensing System
                </Link>
              </li>
              <li>
                <Link to="/piracy-detection" className="text-gray-400 hover:text-white">
                  Piracy Detection
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-gray-400 hover:text-white">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 tracking-wider uppercase mb-4">
              Company
            </h3>
            <ul className="space-y-2">
              <li>
                <Link to="/about" className="text-gray-400 hover:text-white">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/faqs" className="text-gray-400 hover:text-white">
                  FAQs
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-400 hover:text-white">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/explorer" className="text-gray-400 hover:text-white">
                  Explorer
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 tracking-wider uppercase mb-4">
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
              <Link to="/privacy" className="text-gray-400 hover:text-white">
      Privacy Policy
    </Link>
              </li>
              <li>
              <Link to="/terms-of-service" className="text-gray-400 hover:text-white">
                  Terms of Service
                </Link>
              </li>
              <li>
              <Link to="/copyright-policy" className="text-gray-400 hover:text-white">
                  Copyright Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-700">
          <p className="text-gray-400 text-sm text-center">
            &copy; {new Date().getFullYear()} xDRM by Softech Digital Group. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;