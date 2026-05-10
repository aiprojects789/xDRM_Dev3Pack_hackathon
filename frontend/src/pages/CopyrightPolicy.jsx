import React from "react";
import { Copyright, FileCheck, AlertCircle, Gavel, Mail } from "lucide-react";

const CopyrightPolicy = () => {
  const sections = [
    {
      icon: <Copyright className="w-6 h-6" />,
      title: "1. Copyright Ownership",
      description: "Users must ensure they own or are authorized to register any content uploaded to xDRM."
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: "2. Registration & Proof",
      items: [
        "xDRM records content hashes, timestamps, and ownership claims on blockchain",
        "This serves as evidence of registration, not a court judgment"
      ]
    },
    {
      icon: <AlertCircle className="w-6 h-6" />,
      title: "3. Infringement Reporting",
      description: "If you believe your copyrighted work has been infringed:",
      items: [
        "Submit a written notice including proof of ownership",
        "Include content identifiers and URLs",
        "Email: legal@softechdigitalgroup.com"
      ],
      important: true
    },
    {
      icon: <Gavel className="w-6 h-6" />,
      title: "4. Takedown & Dispute Handling",
      items: [
        "We review complaints fairly and with integrity",
        "Accounts with repeated infringement may be suspended",
        "Disputes between parties are their own legal responsibility"
      ]
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: "5. No Legal Representation",
      description: "xDRM does not act as a legal authority or arbitrator in copyright disputes."
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
              <Copyright className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl text-center">
            Copyright Policy
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100 mx-auto text-center">
            xDRM respects intellectual property rights and expects users to do the same.
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
                section.important ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              {/* Section Header */}
              <div className={`px-8 py-6 ${
                section.important
                  ? 'bg-gradient-to-r from-red-500 to-red-600'
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
                    {section.items.map((item, itemIndex) => {
                      const isEmail = item.includes('@');
                      return (
                        <div
                          key={itemIndex}
                          className={`flex items-start gap-4 p-4 rounded-lg transition-colors border-l-4 ${
                            section.important
                              ? 'bg-red-50 hover:bg-red-100 border-red-500'
                              : 'bg-gray-50 hover:bg-purple-50 border-purple-500'
                          }`}
                        >
                          <div className="flex-shrink-0 mt-1">
                            <div className={`w-2 h-2 rounded-full ${
                              section.important ? 'bg-red-600' : 'bg-purple-600'
                            }`}></div>
                          </div>
                          {isEmail ? (
                            <span className="text-gray-700 flex-1">
                              {item.split(':')[0]}:{' '}
                              <a
                                href={`mailto:${item.split(':')[1]?.trim()}`}
                                className="text-purple-600 hover:text-purple-800 underline font-semibold"
                              >
                                {item.split(':')[1]?.trim()}
                              </a>
                            </span>
                          ) : (
                            <span className="text-gray-700 flex-1">{item}</span>
                          )}
                        </div>
                      );
                    })}
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
              For copyright-related inquiries, please contact us at:
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

export default CopyrightPolicy;