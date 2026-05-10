import React,{useContext} from 'react'
import { Link } from 'react-router-dom';
import { Shield, FileText, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '@mui/material';
import AuthContext from '../context/AuthContext'
const Home = () => {
    const { isLogin } = useContext(AuthContext)
  
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
            Protect and Monetize Your Digital Creations
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100">
            A blockchain-powered, DRM-based platform that safeguards your digital artwork, ensures true ownership, prevents unauthorized use, enables simple account-based transactions, and creates ethical revenue streams.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link to={!isLogin? "/auth":"/dashboard/upload"}>
              <Button variant="contained" color='secondary' size="lg" className='!p-4'>
          {!isLogin?
                'Get Started'
                :'Upload Artwork'
              }
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="contained" color='secondary' size="lg" className="!p-4">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* About the Platform */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">About Our Platform</h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Ethical Protection for Digital Creators
            </p>
            <p className="max-w-xl mt-5 mx-auto text-lg text-gray-500">
              Our platform combines blockchain technology with 
              powerful tools to protect digital artists while upholding ethical standards.
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
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Secure Ownership</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Register your artwork on the blockchain to create an immutable record 
                      of ownership that can't be tampered with or disputed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-emerald-600 rounded-md shadow-lg">
                        <FileText className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Automated Licensing</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Create custom licenses for your work and let smart contracts handle 
                      the permissions, usage rights, and expirations automatically.
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
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Direct Royalties</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Receive payments directly to your wallet whenever someone 
                      licenses your work, with no intermediaries taking a cut.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-red-600 rounded-md shadow-lg">
                        <AlertCircle className="h-6 w-6 text-white" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Piracy Detection</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Our intelligent scanning system monitors the web for unauthorized 
                      use of your work and helps you take action.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-purple-600 rounded-md shadow-lg">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Instant Blockchain Verification</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Allow buyers to instantly verify the authenticity and provenance 
                      of your work through our blockchain verification tools.
                    </p>
                  </div>
                </div>
              </div>

              {/* <div className="pt-6">
                <div className="flow-root bg-white rounded-lg shadow-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-cyan-600 rounded-md shadow-lg">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Artist Community</h3>
                    <p className="mt-5 text-base text-gray-500">
                      Connect with other ethical creators, share best practices, 
                      and build a supportive network of responsible digital artists.
                    </p>
                  </div>
                </div>
              </div> */}
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
              How It Works
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl sm:tracking-tight">
              Protect your work in three simple steps
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
                    Upload your digital creation to our secure platform and provide 
                    details about your work, including title, description, and licensing preferences.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-800 text-white">
                  <span className="text-lg font-bold">2</span>
                </div>
                <div className="ml-16">
                  <h3 className="text-lg font-medium text-gray-900">Register on Blockchain</h3>
                  <p className="mt-2 text-base text-gray-500">
                    With a single click, we'll register your work on the blockchain, 
                    creating a permanent, tamper-proof record of your ownership.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-800 text-white">
                  <span className="text-lg font-bold">3</span>
                </div>
                <div className="ml-16">
                  <h3 className="text-lg font-medium text-gray-900">Manage Your Rights</h3>
                  <p className="mt-2 text-base text-gray-500">
                    Set up licensing terms, receive notifications about potential piracy, 
                    and collect royalties directly to your wallet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials
      <div className="bg-blue-800">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white">
            Trusted by digital creators worldwide
          </h2>
          <div className="mt-6 bg-white bg-opacity-10 rounded-lg shadow-xl overflow-hidden">
            <div className="relative max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <div className="relative">
                <blockquote className="mt-8">
                  <div className="max-w-3xl mx-auto text-center text-xl font-medium text-white">
                    <p>
                      "As a digital artist, I've always been concerned about protecting 
                      my work while maintaining ethical standards. SecureArt has given me full 
                      control over my creations while ensuring fair compensation for my work."
                    </p>
                  </div>
                  <footer className="mt-8">
                    <div className="md:flex md:items-center md:justify-center">
                      <div className="md:flex-shrink-0">
                        <img
                          className="mx-auto h-12 w-12 rounded-full"
                          src="https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
                          alt=""
                        />
                      </div>
                      <div className="mt-3 text-center md:mt-0 md:ml-4 md:flex md:items-center">
                        <div className="text-base font-medium text-white">James Wilson</div>
                        <svg className="hidden md:block mx-1 h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 0h3L9 20H6l5-20z" />
                        </svg>
                        <div className="text-base font-medium text-blue-200">Digital Artist</div>
                      </div>
                    </div>
                  </footer>
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </div> */}

      {/* CTA */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="bg-blue-800 rounded-lg shadow-xl overflow-hidden">
            <div className="pt-10 pb-12 px-6 sm:pt-16 sm:px-16 lg:py-16 lg:pr-0 xl:py-20 xl:px-20">
              <div className="lg:self-center">
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  <span className="block">Ready to protect your digital creations?</span>
                </h2>
                <p className="mt-4 text-lg leading-6 text-blue-100">
                  Join our community of ethical digital creators and take control of your artwork today.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Link to="/auth">
                    <Button variant="contained" color='secondary' size="lg" className="!p-4">
                      Get Started
                    </Button>
                  </Link>
                  <Link to="/faqs">
                    <Button variant="contained" color='secondary' size="lg" className="!p-4">
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
}

export default Home
