import React from 'react';
import { FileText, Clock, DollarSign, Users, Settings, CheckCircle } from 'lucide-react';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

const LicensingSystem = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900 to-emerald-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')" }}
        ></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Licensing System
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-emerald-100">
            Create, manage, and automate licenses for your digital artwork with our 
            smart contract-powered licensing system. Set your terms, automate enforcement, 
            and earn revenue effortlessly.
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-emerald-800 tracking-wide uppercase">
              Licensing Features
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Complete Control Over Your Artwork Usage
            </p>
            <p className="max-w-xl mt-5 mx-auto text-lg text-gray-500">
              Our intelligent licensing system gives you the power to define how your 
              artwork can be used, by whom, and for how long.
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-emerald-600 rounded-md shadow-lg">
                        <FileText className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Custom License Templates
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Create custom license agreements with specific terms, usage rights, 
                      and restrictions tailored to your needs.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-md shadow-lg">
                        <Clock className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Time-Based Licenses
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Set expiration dates and automatic renewal options. Licenses 
                      automatically expire when their term ends.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-amber-500 rounded-md shadow-lg">
                        <DollarSign className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Automated Payments
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Receive payments automatically when licenses are purchased. 
                      Smart contracts handle transactions securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-purple-600 rounded-md shadow-lg">
                        <Users className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Usage Rights Management
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Define specific usage rights: commercial use, modification rights, 
                      distribution limits, and more.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-red-600 rounded-md shadow-lg">
                        <Settings className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      Smart Contract Enforcement
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Licenses are enforced automatically through blockchain smart contracts, 
                      ensuring compliance without manual intervention.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-cyan-600 rounded-md shadow-lg">
                        <CheckCircle className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">
                      License Verification
                    </h3>
                    <p className="mt-5 text-base text-gray-500">
                      Buyers can instantly verify license validity and terms through 
                      our blockchain verification system.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* License Types */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-emerald-800 tracking-wide uppercase">
              License Types
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl sm:tracking-tight">
              Flexible Licensing Options
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-emerald-200">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Personal Use</h3>
                <p className="text-gray-600 mb-6">
                  For individual, non-commercial use. Perfect for personal projects, 
                  portfolios, and educational purposes.
                </p>
                <ul className="space-y-2 text-gray-500">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Non-commercial use only</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Single user license</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>No modification rights</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-blue-200">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Commercial Use</h3>
                <p className="text-gray-600 mb-6">
                  For business and commercial applications. Includes marketing, 
                  advertising, and product use.
                </p>
                <ul className="space-y-2 text-gray-500">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Full commercial rights</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Multiple users allowed</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Extended usage terms</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-purple-200">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Exclusive License</h3>
                <p className="text-gray-600 mb-6">
                  Exclusive rights to use the artwork. The artist grants sole usage 
                  rights to a single licensee.
                </p>
                <ul className="space-y-2 text-gray-500">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Exclusive usage rights</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Custom terms negotiable</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Premium pricing</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-emerald-800 tracking-wide uppercase">
              How It Works
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl sm:tracking-tight">
              Set Up Licenses in Minutes
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">1</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Create License</h3>
                <p className="mt-2 text-base text-gray-500">
                  Define your license terms, pricing, and usage rights through our intuitive interface.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">2</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Deploy to Blockchain</h3>
                <p className="mt-2 text-base text-gray-500">
                  Your license is deployed as a smart contract on the blockchain for automatic enforcement.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">3</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Buyers Purchase</h3>
                <p className="mt-2 text-base text-gray-500">
                  Buyers can purchase licenses directly, with payments automatically processed.
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-600 text-white mx-auto mb-4">
                  <span className="text-2xl font-bold">4</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Automated Management</h3>
                <p className="mt-2 text-base text-gray-500">
                  Licenses are automatically enforced, tracked, and managed through smart contracts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="bg-emerald-800 rounded-lg shadow-xl overflow-hidden">
            <div className="pt-10 pb-12 px-6 sm:pt-16 sm:px-16 lg:py-16 lg:pr-0 xl:py-20 xl:px-20">
              <div className="lg:self-center">
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  <span className="block">Start Licensing Your Artwork Today</span>
                </h2>
                <p className="mt-4 text-lg leading-6 text-emerald-100">
                  Create your first license and begin monetizing your digital creations with automated, 
                  blockchain-enforced licensing.
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

export default LicensingSystem;




