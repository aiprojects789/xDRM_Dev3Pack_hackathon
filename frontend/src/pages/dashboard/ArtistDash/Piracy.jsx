import React from 'react'
import DataTable from '../../../components/dashboard/DataTable'
const Piracy = () => {
  const rows = [
    {
      id: 1,
      detected_Artwork: "Artx0123",
      source: "Herein",
      date_detected: "2023-10-01",
      status: "Pending",
    },
    {
      id: 2,
      detected_Artwork: "Artx0124",
      source: "Herein",
      date_detected: "2023-12-01",
      status: "Pending",
    },
    {
      id: 3,
      detected_Artwork: "Artx0125",
      source: "Herein",
      date_detected: "2023-11-01",
      status: "Active",
    },
  
  ];
  const headCells = [
    { id: "detected_Artwork", numeric: false, disablePadding: true, label: "Artwork Detected" },
    { id: "source", numeric: false, disablePadding: false, label: "Source" },
    { id: "date_detected", numeric: false, disablePadding: false, label: "Date Detected" },
    { id: "status", numeric: false, disablePadding: false, label: "Status" },
  ];
  return (
    <>
    <h1 className='text-2xl text-gray-900 font-bold'>Piracy Alert</h1>
      <DataTable rows={rows} headCells={headCells}/>
    </>
  )
}

export default Piracy
