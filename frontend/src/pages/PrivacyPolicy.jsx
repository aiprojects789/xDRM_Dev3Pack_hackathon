import React from "react";
import { Shield, Database, Share2, Lock, UserCheck, Cookie, RefreshCw, Mail } from "lucide-react";

const PrivacyPolicy = () => {
  const sections = [
    {
      icon: <Database className="w-6 h-6" />,
      title: "1. Information We Collect",
      description: "We may collect the following types of information:",
      items: [
        { label: "Personal Information", value: "Name, email address, organization name, contact details" },
        { label: "Account Information", value: "Login credentials, user preferences" },
        { label: "Content & Metadata", value: "Digital content identifiers, hashes, ownership records, licensing terms" },
        { label: "Blockchain Data", value: "Public wallet addresses and transaction references (no private keys)" },
        { label: "Usage Data", value: "Log files, access timestamps, IP addresses, device/browser type" }
      ]
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "2. How We Use Your Information",
      description: "We use your data to:",
      items: [
        { value: "Verify ownership and manage digital rights" },
        { value: "Register and track content on blockchain" },
        { value: "Enforce licensing and access controls" },
        { value: "Improve platform performance and security" },
        { value: "Comply with legal and regulatory obligations" }
      ]
    },
    {
      icon: <Share2 className="w-6 h-6" />,
      title: "3. Data Sharing",
      description: "We do not sell personal data. We may share limited data with:",
      items: [
        { value: "Blockchain networks (public, immutable records)" },
        { value: "Cloud and infrastructure providers" },
        { value: "Legal authorities if required by law" }
      ]
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "4. Data Security",
      description: "We implement:",
      items: [
        { value: "Encryption of sensitive data" },
        { value: "Secure access controls" },
        { value: "Blockchain-based immutability for rights records" }
      ],
      note: "However, no system is 100% secure, and users acknowledge inherent digital risks."
    },
    {
      icon: <UserCheck className="w-6 h-6" />,
      title: "5. User Rights",
      description: "You may request:",
      items: [
        { value: "Access to your personal data" },
        { value: "Correction of inaccurate information" },
        { value: "Account deletion (excluding immutable blockchain records)" }
      ]
    },
    {
      icon: <Cookie className="w-6 h-6" />,
      title: "6. Cookies",
      description: "xDRM may use cookies for authentication and analytics purposes."
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: "7. Changes",
      description: "We may update this policy periodically. Continued use constitutes acceptance."
    }
  ];

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 bg-white/10 rounded-full backdrop-blur-sm">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl text-center">
            Privacy Policy
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100 mx-auto text-center">
            xDRM is committed to protecting your privacy and personal data.
          </p>
        </div>
      </div>

      {/* Introduction */}
      <div className="bg-gradient-to-b from-purple-50 to-white py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-xl shadow-lg p-8 border border-purple-100">
            <p className="text-lg text-gray-700 leading-relaxed">
              <strong className="text-purple-900">xDRM</strong> ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal and content-related data when you use our platform.
            </p>
            <p className="text-sm text-gray-500 mt-4 italic">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-8">
          {sections.map((section, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200 overflow-hidden"
            >
              {/* Section Header */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                    <div className="text-white">
                      {section.icon}
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{section.title}</h2>
                </div>
              </div>

              {/* Section Content */}
              <div className="p-8">
                <p className="text-gray-700 text-lg mb-6 font-medium">
                  {section.description}
                </p>

                {section.items && (
                  <div className="space-y-4">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-purple-50 transition-colors border-l-4 border-purple-500"
                      >
                        <div className="flex-shrink-0 mt-1">
                          <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                        </div>
                        <div className="flex-1">
                          {item.label ? (
                            <>
                              <strong className="text-gray-900 font-semibold block mb-1">
                                {item.label}:
                              </strong>
                              <span className="text-gray-700">{item.value}</span>
                            </>
                          ) : (
                            <span className="text-gray-700">{item.value}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {section.note && (
                  <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
                    <p className="text-gray-700 italic">{section.note}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Section */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-white/20 rounded-full">
                <Mail className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white text-center mb-4">Contact Us</h2>
            <p className="text-blue-100 text-center text-lg mb-6">
              For privacy-related inquiries, please contact us at:
            </p>
            <div className="text-center">
              <a
                href="mailto:legal@softechdigitalgroup.com"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-700 rounded-lg font-semibold hover:bg-purple-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <Mail className="w-5 h-5" />
                legal@softechdigitalgroup.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;