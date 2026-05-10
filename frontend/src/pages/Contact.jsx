import React from "react";
import { Button, Form, Input } from "antd";

const validateMessages = {
  required: "${label} is required!",
  types: {
    email: "${label} is not a valid email!",
  },
};

const onFinish = (values) => {
  console.log(values);
};

const Contact = () => (
  <div className="bg-white">
    {/* Hero Section */}
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-900 to-purple-700 opacity-90"></div>
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{
          backgroundImage:
            "url('https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')",
        }}
      ></div>
      <div className="relative max-w-4xl mx-auto py-20 px-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white">
          Contact Us
        </h1>
        <p className="mt-4 text-lg text-blue-100">
          Have questions about <span className="font-semibold">XDRM</span>?  
          We're here to help. Fill out the form below and our team will get back
          to you shortly.
        </p>
      </div>
    </div>

    {/* Contact Form Section */}
    <div className="flex justify-center items-start py-16 bg-gray-50 px-4 min-h-[60vh]">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 sm:p-10">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Get in Touch
          </h2>
          <p className="text-base sm:text-md text-gray-500">
            We'd love to hear from you. Please provide your details below.
          </p>
        </div>

        <Form
          name="contact-form"
          layout="vertical"
          onFinish={onFinish}
          validateMessages={validateMessages}
          className="w-full"
          size="large"
        >
          {/* Name */}
          <Form.Item
            name={["user", "name"]}
            label={
              <span className="text-gray-700 font-medium text-base">
                Name <span className="text-red-500">*</span>
              </span>
            }
            rules={[{ required: true, message: "Please enter your name" }]}
            className="mb-6"
          >
            <Input 
              placeholder="Enter your name"
              className="rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring focus:ring-purple-200 !py-3 !text-base h-auto" 
            />
          </Form.Item>

          {/* Email */}
          <Form.Item
            name={["user", "email"]}
            label={
              <span className="text-gray-700 font-medium text-base">
                Email <span className="text-red-500">*</span>
              </span>
            }
            rules={[
              { type: "email", message: "Please enter a valid email" },
              { required: true, message: "Please enter your email" }
            ]}
            className="mb-6"
          >
            <Input 
              type="email"
              placeholder="Enter your email"
              className="rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring focus:ring-purple-200 !py-3 !text-base h-auto" 
            />
          </Form.Item>

          {/* Message */}
          <Form.Item
            name={["user", "description"]}
            label={
              <span className="text-gray-700 font-medium text-base">
                Message
              </span>
            }
            className="mb-6"
          >
            <Input.TextArea
              rows={5}
              placeholder="Enter your message"
              className="rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring focus:ring-purple-200 !text-base resize-y"
              style={{ minHeight: '120px' }}
            />
          </Form.Item>

          {/* Submit Button */}
          <Form.Item className="mb-0">
            <Button
              type="primary"
              htmlType="submit"
              block
              className="bg-purple-600 hover:bg-purple-700 border-purple-600 hover:border-purple-700 transition-all duration-200 text-white font-semibold !text-base !py-4 !h-auto rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              Send Message
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  </div>
);

export default Contact;
