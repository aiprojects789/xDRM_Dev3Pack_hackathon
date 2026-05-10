import React from 'react';
import { AlertTriangle, Search, Shield, FileX, TrendingUp, Bell } from 'lucide-react';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

const PiracyDetection = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-red-900 to-red-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')" }}
        ></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Piracy Detection
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-red-100">
            Protect your digital artwork with intelligent web scanning that detects 
            unauthorized use across the internet. Get instant alerts and take action 
            to safeguard your creative rights.
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-red-800 tracking-wide uppercase">
              Detection Features
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Advanced Monitoring for Your Artwork
            </p>
            <p className="max-w-xl mt-5 mx-auto text-lg text-gray-500">
              Our AI-powered detection system continuously scans the web to identify 
              unauthorized use of your protected artwork.
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-red-600 rounded-md shadow-lg">
                        <Search className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Web Crawling
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Automated scanning of millions of websites, marketplaces, and 
                      social media platforms to find unauthorized copies of your work.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-orange-600 rounded-md shadow-lg">
                        <AlertTriangle className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Real-Time Alerts
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Receive instant notifications via email or dashboard when potential 
                      piracy is detected, with detailed information about the infringement.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-yellow-500 rounded-md shadow-lg">
                        <Shield className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Image Recognition
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Advanced AI algorithms identify your artwork even when it's been 
                      cropped, resized, or slightly modified.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-purple-600 rounded-md shadow-lg">
                        <FileX className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Takedown Assistance
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Get help with DMCA takedown requests and legal documentation 
                      to remove unauthorized copies from websites.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                        <TrendingUp className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Infringement Analytics
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Track piracy trends, identify repeat offenders, and analyze 
                      the impact of unauthorized use on your artwork's value.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-cyan-600 rounded-md shadow-lg">
                        <Bell className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Custom Monitoring
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Set up custom monitoring rules for specific platforms, regions, 
                      or types of usage that matter most to you.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-red-800 tracking-wide uppercase">
              How Detection Works
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl sm:tracking-tight">
              Continuous Protection for Your Artwork
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">1</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Register Artwork</h3>
                <p className="mt-2 text-base text-gray-500">
                  Upload and register your artwork on our platform. Our system creates 
                  a unique fingerprint for detection.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">2</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Automated Scanning</h3>
                <p className="mt-2 text-base text-gray-500">
                  Our crawlers continuously scan websites, marketplaces, and social 
                  media platforms 24/7 for unauthorized use.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">3</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">AI Analysis</h3>
                <p className="mt-2 text-base text-gray-500">
                  Advanced image recognition AI analyzes potential matches, filtering 
                  false positives and identifying real infringements.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">4</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Take Action</h3>
                <p className="mt-2 text-base text-gray-500">
                  Receive detailed reports and get assistance with takedown requests 
                  to remove unauthorized copies.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detection Capabilities */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-red-800 tracking-wide uppercase">
              What We Detect
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Comprehensive Coverage
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Website Usage</h3>
              <p className="mt-2 text-gray-600">
                Detect unauthorized use on websites, blogs, and online publications.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Marketplace Listings</h3>
              <p className="mt-2 text-gray-600">
                Find your artwork being sold without permission on e-commerce platforms.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Social Media</h3>
              <p className="mt-2 text-gray-600">
                Monitor Instagram, Facebook, Twitter, and other social platforms for unauthorized sharing.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Stock Photo Sites</h3>
              <p className="mt-2 text-gray-600">
                Identify when your artwork appears on stock photo websites without authorization.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Modified Versions</h3>
              <p className="mt-2 text-gray-600">
                Detect cropped, resized, or edited versions of your original artwork.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Print-on-Demand</h3>
              <p className="mt-2 text-gray-600">
                Find unauthorized use on print-on-demand services and merchandise platforms.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900">
                Why Piracy Detection Matters
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start">
                <AlertTriangle className="h-6 w-6 text-red-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900">Protect Your Revenue</h3>
                  <p className="mt-1 text-gray-600">
                    Unauthorized use directly impacts your ability to monetize your artwork. 
                    Early detection helps minimize losses.
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <Shield className="h-6 w-6 text-red-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900">Maintain Brand Integrity</h3>
                  <p className="mt-1 text-gray-600">
                    Control how your artwork is used and ensure it's not associated with 
                    unauthorized or inappropriate contexts.
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <FileX className="h-6 w-6 text-red-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900">Legal Protection</h3>
                  <p className="mt-1 text-gray-600">
                    Documented evidence of piracy strengthens your position in legal 
                    disputes and copyright claims.
                  </p>
                </div>
              </div>
              <div className="flex items-start">
                <TrendingUp className="h-6 w-6 text-red-600 mr-3 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900">Market Intelligence</h3>
                  <p className="mt-1 text-gray-600">
                    Understand where and how your artwork is being used to make informed 
                    decisions about licensing and distribution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="bg-red-800 rounded-lg shadow-xl overflow-hidden">
            <div className="pt-10 pb-12 px-6 sm:pt-16 sm:px-16 lg:py-16 lg:pr-0 xl:py-20 xl:px-20">
              <div className="lg:self-center">
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  <span className="block">Start Protecting Your Artwork Today</span>
                </h2>
                <p className="mt-4 text-lg leading-6 text-red-100">
                  Join thousands of artists who trust our piracy detection system to 
                  safeguard their digital creations.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Link to="/auth">
                    <Button variant="contained" color="secondary" size="lg" className="!p-4">
                      Get Started
                    </Button>
                  </Link>
                  <Link to="/pricing">
                    <Button variant="contained" color="secondary" size="lg" className="!p-4">
                      View Pricing
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PiracyDetection;




