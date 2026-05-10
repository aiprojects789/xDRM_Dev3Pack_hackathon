import React from 'react'
import AppRoutes from './routes/Approutes'
import { Toaster } from "react-hot-toast";
import DRMProtection from './components/common/DRMProtection';

const App = () => {
  return (
    <>
      <DRMProtection />
      <AppRoutes />
      <Toaster position="top-right" reverseOrder={false} />
    </>
  )
}
export default App;