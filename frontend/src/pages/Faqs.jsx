import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Button,
  Paper,
} from "@mui/material";
import { styled } from "@mui/system";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import {
  FaUser,
  FaMoneyBill,
  FaTools,
  FaCogs,
  FaCreditCard,
  FaRocket,
} from "react-icons/fa";
import { Link } from "react-router-dom";

const StyledAccordion = styled(Accordion)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  "&:before": {
    display: "none",
  },
  transition: "all 0.2s ease",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  "&:hover": {
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
  },
}));

const Faqs = () => {
  const [search, setSearch] = useState("");

  const faqData = [
    {
      category: "Getting Started",
      icon: <FaRocket />,
      question: "What are the features of this platform?",
      answer:
        "It's a blockchain-powered digital rights management (DRM) solution designed to protect digital art, ensure secure ownership, and provide automated, ethical licensing for creators.",
    },
    {
      category: "Ownership & Security",
      icon: <FaUser />,
      question: "How does the platform protect my digital art?",
      answer:
        "Each asset is immutably recorded on the blockchain, making it tamper-proof. Smart contracts handle licensing and ensure your rights and royalties are protected and enforced automatically.",
    },
    {
      category: "Licensing & Monetization",
      icon: <FaCreditCard />,
      question: "How are royalties and licensing handled?",
      answer:
        "Our platform uses smart contracts to automate royalty distribution instantly and fairly — removing middlemen and reducing delays in payments.",
    },
    {
      category: "Technology & Ethics",
      icon: <FaCogs />,
      question: "What makes this platform 'ethical'?",
      answer:
        "The system is built with ethical values in mind, promoting transparency, fairness, and integrity. It ensures artists retain ownership and are paid fairly without exploitation.",
    },
    {
      category: "Support & Education",
      icon: <FaTools />,
      question: "I'm new to blockchain. Can I still use it?",
      answer:
        "Absolutely. We provide user-friendly interfaces, onboarding support, and educational materials to help you understand and adopt blockchain without technical expertise.",
    },
    {
      category: "Business Model",
      icon: <FaMoneyBill />,
      question: "How does the platform generate revenue?",
      answer:
        "Through SaaS subscriptions, transaction fees on licensing, and enterprise-level API integration for marketplaces, educational platforms, and content libraries.",
    },
  ];

  const filteredFaqs = useMemo(() => {
    if (!search) return faqData;
    return faqData.filter(
      (faq) =>
        faq.question.toLowerCase().includes(search.toLowerCase()) ||
        faq.answer.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, faqData]);

  return (
    <Box className="bg-white min-h-screen">
      {/* Hero Section */}
      <Box className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/3184306/pexels-photo-3184306.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')",
          }}
        ></div>
        <Box className="relative max-w-4xl mx-auto py-20 px-6 text-center">
          <Typography variant="h3" className="text-white font-extrabold">
            Frequently Asked Questions
          </Typography>
          <Typography variant="h6" className="mt-4 text-blue-100">
            Find answers to the most common questions about our platform,
            services, and technology.
          </Typography>
        </Box>
      </Box>

      {/* Search Bar */}
      <Box className="max-w-3xl mx-auto px-6 mt-2 mb-10">
        <Paper
          component="form"
          className="flex items-center px-3 py-2 rounded-lg shadow-md"
        >
          <FiSearch className="text-gray-500 mr-2" size={22} />
          <TextField
            placeholder="Search FAQs..."
            fullWidth
            variant="standard"
            className="block w-full pl-10 pr-3 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              disableUnderline: true,
            }}
          />
        </Paper>
      </Box>

      {/* FAQs List */}
      <Box className="max-w-4xl mx-auto px-6 pb-16">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, index) => (
            <StyledAccordion key={index}>
              <AccordionSummary expandIcon={<FiChevronDown />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {faq.icon}
                  <Typography variant="h6">{faq.question}</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Typography color="textSecondary">{faq.answer}</Typography>
              </AccordionDetails>
            </StyledAccordion>
          ))
        ) : (
          <Typography align="center" color="textSecondary" sx={{ mt: 5 }}>
            No results found for your search.
          </Typography>
        )}
      </Box>

      {/* CTA Section */}
      <Box className="bg-purple-600 py-12 text-center">
        <Typography variant="h5" className="text-white font-bold mb-4">
          Didn't find what you're looking for?
        </Typography>
        <Link to="/contact">
          <Button
            variant="contained"
            color="secondary"
            size="large"
            className="!p-4"
          >
            Contact Support
          </Button>
        </Link>
      </Box>
    </Box>
  );
};

export default Faqs;
