import React from 'react';
import { Shield, Lock, FileCheck, Eye, CheckCircle } from 'lucide-react';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

const ArtworkProtection = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-blue-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')" }}
        ></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Artwork Protection
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100">
            Secure your digital creations with blockchain-powered protection that ensures 
            true ownership and prevents unauthorized use of your artwork.
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
              Protection Features
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Comprehensive Security for Your Digital Art
            </p>
            <p className="max-w-xl mt-5 mx-auto text-lg text-gray-500">
              Our advanced protection system combines blockchain technology with 
              cutting-edge security measures to safeguard your creative work.
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-blue-800 rounded-md shadow-lg">
                        <Shield className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Blockchain Registration
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Register your artwork on an immutable blockchain ledger, creating 
                      a permanent, tamper-proof record of ownership that can't be disputed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-emerald-600 rounded-md shadow-lg">
                        <Lock className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Digital Watermarking
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Invisible watermarks embedded in your artwork help track and 
                      identify unauthorized use across the internet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-amber-500 rounded-md shadow-lg">
                        <FileCheck className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Certificate of Authenticity
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Receive a verifiable certificate proving your ownership and 
                      the authenticity of your digital creation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-purple-600 rounded-md shadow-lg">
                        <Eye className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Usage Monitoring
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Track where and how your artwork is being used, with real-time 
                      notifications of any unauthorized access or distribution.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-red-600 rounded-md shadow-lg">
                        <CheckCircle className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Provenance Tracking
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Maintain a complete history of your artwork's ownership and 
                      transactions on the blockchain for full transparency.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-cyan-600 rounded-md shadow-lg">
                        <Shield className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      IPFS Storage
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Your artwork is stored on decentralized IPFS networks, ensuring 
                      permanent availability and resistance to censorship.
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
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
              How Protection Works
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl sm:tracking-tight">
              Secure Your Artwork in Simple Steps
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-800 text-white">
                  <span className="text-lg font-bold">1</span>
                </div>
                <div className="ml-16">
                  <h3 className="text-lg font-medium text-gray-900">Upload Your Artwork</h3>
                  <p className="mt-2 text-base text-gray-500">
                    Upload your digital creation to our secure platform. Your file is 
                    encrypted and stored safely on decentralized networks.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-800 text-white">
                  <span className="text-lg font-bold">2</span>
                </div>
                <div className="ml-16">
                  <h3 className="text-lg font-medium text-gray-900">Blockchain Registration</h3>
                  <p className="mt-2 text-base text-gray-500">
                    We create a unique hash of your artwork and register it on the 
                    blockchain, establishing an immutable proof of ownership.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-800 text-white">
                  <span className="text-lg font-bold">3</span>
                </div>
                <div className="ml-16">
                  <h3 className="text-lg font-medium text-gray-900">Ongoing Protection</h3>
                  <p className="mt-2 text-base text-gray-500">
                    Your artwork is continuously monitored for unauthorized use, and 
                    you receive alerts whenever potential infringement is detected.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
              Why Choose Our Protection
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Benefits for Digital Artists
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Legal Proof</h3>
              <p className="mt-2 text-gray-600">
                Blockchain records serve as legal evidence of ownership in copyright disputes.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Peace of Mind</h3>
              <p className="mt-2 text-gray-600">
                Know that your creative work is protected 24/7 with automated monitoring.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Increased Value</h3>
              <p className="mt-2 text-gray-600">
                Protected artwork commands higher prices and attracts serious buyers.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Global Reach</h3>
              <p className="mt-2 text-gray-600">
                Protect your work worldwide with our international monitoring network.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Easy Management</h3>
              <p className="mt-2 text-gray-600">
                Manage all your protected artworks from a single, intuitive dashboard.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">No Expiration</h3>
              <p className="mt-2 text-gray-600">
                Your protection never expires - once registered, it's permanent on the blockchain.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="bg-blue-800 rounded-lg shadow-xl overflow-hidden">
            <div className="pt-10 pb-12 px-6 sm:pt-16 sm:px-16 lg:py-16 lg:pr-0 xl:py-20 xl:px-20">
              <div className="lg:self-center">
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  <span className="block">Ready to Protect Your Artwork?</span>
                </h2>
                <p className="mt-4 text-lg leading-6 text-blue-100">
                  Start protecting your digital creations today with blockchain-powered security.
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

export default ArtworkProtection;




