
import React from "react";
import { Users, Target, HeartHandshake, Globe } from "lucide-react";
import { Button } from "@mui/material";
import { Link } from "react-router-dom";

const AboutUs = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('https://images.pexels.com/photos/1616403/pexels-photo-1616403.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')" }}
        ></div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            About Us
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-blue-100">
            We are a blockchain-powered, DRM-based platform built to protect,
            empower, and inspire digital creators worldwide. Our mission is to
            provide security, fairness, and ethical revenue streams for artists
            in the digital age.
          </p>
        </div>
      </div>

      {/* Mission & Vision */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
            Our Mission & Vision
          </h2>
          <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Protecting Art. Empowering Artists.
          </p>
          <p className="max-w-3xl mt-5 mx-auto text-lg text-gray-500">
            We envision a world where artists remain the rightful owners of their
            creations, free from exploitation and unauthorized use. Through
            blockchain technology and DRM tools, we ensure that creativity is
            rewarded fairly and transparently.
          </p>
        </div>
      </div>

      {/* Core Values */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-blue-800 tracking-wide uppercase">
              Our Core Values
            </h2>
            <p className="mt-1 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              What Drives Us
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <Users className="h-12 w-12 mx-auto text-blue-800" />
              <h3 className="mt-6 text-lg font-medium text-gray-900">
                Community
              </h3>
              <p className="mt-4 text-base text-gray-500">
                We build a supportive network of digital creators to share,
                collaborate, and thrive together.
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <Target className="h-12 w-12 mx-auto text-emerald-600" />
              <h3 className="mt-6 text-lg font-medium text-gray-900">
                Transparency
              </h3>
              <p className="mt-4 text-base text-gray-500">
                With blockchain-backed verification, every transaction is
                transparent, secure, and tamper-proof.
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <HeartHandshake className="h-12 w-12 mx-auto text-amber-500" />
              <h3 className="mt-6 text-lg font-medium text-gray-900">Ethics</h3>
              <p className="mt-4 text-base text-gray-500">
                We believe in fair treatment, ensuring creators earn what they
                deserve without intermediaries.
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <Globe className="h-12 w-12 mx-auto text-purple-600" />
              <h3 className="mt-6 text-lg font-medium text-gray-900">
                Global Reach
              </h3>
              <p className="mt-4 text-base text-gray-500">
                Our platform connects artists and buyers worldwide, breaking
                barriers and creating opportunities.
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
                  <span className="block">Join Our Mission</span>
                </h2>
                <p className="mt-4 text-lg leading-6 text-blue-100">
                  Become part of a movement that protects creators and rewards
                  creativity. Your art deserves it.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <Link to="/auth">
                    <Button
                      variant="contained"
                      color="secondary"
                      size="lg"
                      className="!p-4"
                    >
                      Get Started
                    </Button>
                  </Link>
                  <Link to="/contact">
                    <Button
                      variant="contained"
                      color="secondary"
                      size="lg"
                      className="!p-4"
                    >
                      Contact Us
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

export default AboutUs;
