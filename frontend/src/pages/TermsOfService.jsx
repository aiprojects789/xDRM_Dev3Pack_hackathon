import React from "react";
import { FileText, Users, Shield, Ban, AlertTriangle, XCircle, Scale, Mail } from "lucide-react";

const TermsOfService = () => {
  const sections = [
    {
      icon: <FileText className="w-6 h-6" />,
      title: "1. Service Description",
      description: "xDRM provides a blockchain-enabled digital rights management platform that allows creators, organizations, and rights holders to register, manage, license, and monitor digital content."
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "2. Eligibility",
      description: "You must be at least 18 years old and legally capable of entering contracts."
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "3. User Responsibilities",
      description: "You agree to:",
      items: [
        "Provide accurate ownership and licensing information",
        "Only upload content you own or are authorized to manage",
        "Not use xDRM for illegal, infringing, or harmful purposes"
      ]
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "4. Ownership",
      items: [
        "Users retain full ownership of their content",
        "xDRM does not claim ownership over uploaded or registered assets",
        "Blockchain records represent proof of registration, not legal adjudication"
      ]
    },
    {
      icon: <Ban className="w-6 h-6" />,
      title: "5. Prohibited Activities",
      description: "You may not:",
      items: [
        "Upload infringing or stolen content",
        "Attempt to bypass DRM protections",
        "Reverse engineer platform components",
        "Use xDRM for fraud, impersonation, or abuse"
      ],
      warning: true
    },
    {
      icon: <AlertTriangle className="w-6 h-6" />,
      title: "6. Limitation of Liability",
      description: 'xDRM is provided "as is." We are not liable for:',
      items: [
        "Unauthorized third-party use",
        "Blockchain network failures",
        "Indirect or consequential damages"
      ],
      warning: true
    },
    {
      icon: <XCircle className="w-6 h-6" />,
      title: "7. Termination",
      description: "We may suspend or terminate accounts that violate these terms."
    },
    {
      icon: <Scale className="w-6 h-6" />,
      title: "8. Governing Law",
      description: "These terms are governed by applicable laws where xDRM is incorporated."
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
              <FileText className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl text-center">
            Terms of Service
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100 mx-auto text-center">
            By accessing or using xDRM, you agree to these Terms of Service.
          </p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-8">
          {sections.map((section, index) => (
            <div
              key={index}
              className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border-2 overflow-hidden ${
                section.warning ? 'border-orange-200' : 'border-gray-200'
              }`}
            >
              {/* Section Header */}
              <div className={`px-8 py-6 ${
                section.warning 
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600' 
                  : 'bg-gradient-to-r from-purple-600 to-purple-700'
              }`}>
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
                {section.description && (
                  <p className="text-gray-700 text-lg mb-6 font-medium">
                    {section.description}
                  </p>
                )}

                {section.items && (
                  <div className="space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className={`flex items-start gap-4 p-4 rounded-lg transition-colors border-l-4 ${
                          section.warning
                            ? 'bg-orange-50 hover:bg-orange-100 border-orange-500'
                            : 'bg-gray-50 hover:bg-purple-50 border-purple-500'
                        }`}
                      >
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-2 h-2 rounded-full ${
                            section.warning ? 'bg-orange-600' : 'bg-purple-600'
                          }`}></div>
                        </div>
                        <span className="text-gray-700 flex-1">{item}</span>
                      </div>
                    ))}
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
              For questions about these terms, please contact us at:
            </p>
            <div className="text-center">
              <a
                href="mailto:support@softechdigitalgroup.com"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-700 rounded-lg font-semibold hover:bg-purple-50 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <Mail className="w-5 h-5" />
                support@softechdigitalgroup.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;