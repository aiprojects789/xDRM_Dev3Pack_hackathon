# xDRM - Decentralized Digital Rights Management (Solana Edition)

xDRM is a cutting-edge platform designed to protect digital artworks using blockchain technology, AI-driven piracy detection, and forensic watermarking. This version is specifically optimized for the **Solana ecosystem**, leveraging high-speed transactions and low fees for on-chain licensing and ownership verification.

## 🚀 Key Features

- **On-Chain Licensing**: Secure, atomic license purchases directly on the Solana blockchain.
- **AI-Driven Piracy Detection**: Automated scanning for unauthorized use of registered artworks across the web.
- **Forensic Watermarking**: Invisible watermarks embedded in artworks to trace ownership and origin.
- **Creator Dashboard**: Comprehensive tools for artists to manage their portfolio, licenses, and royalties.
- **Cross-Chain Compatibility**: Support for multiple networks with a primary focus on Solana Devnet.

---

## 🛠️ Tech Stack

- **Frontend**: React.js (Vite), Tailwind CSS, Framer Motion, Solana Wallet Adapter.
- **Backend**: Python (FastAPI), MongoDB, Solana Python SDK (`solana-py`, `solders`).
- **Blockchain**: Solana (Devnet), Metaplex (Token Metadata Program).
- **AI/ML**: Transformers, Faiss (for similarity search), ImageHash.

---

## ⚙️ Setup Instructions

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **MongoDB** (Local or Atlas)
- **Phantom Wallet** (for testing on Solana Devnet)

### 2. Backend Setup
Navigate to the `backend` directory:
```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
# Copy essential variables from .env.example (if provided) or set them:
# MONGODB_URL=your_mongodb_connection_string
# SOLANA_RPC_URL=https://api.devnet.solana.com
# SECRET_KEY=your_jwt_secret

# Run the server
uvicorn main:app --reload
```

### 3. Frontend Setup
Navigate to the `frontend` directory:
```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

---

## 📄 Essential Environment Variables

### Backend (`.env`)
- `MONGODB_URL`: Connection string for MongoDB.
- `JWT_SECRET`: Secret key for authentication.
- `SOLANA_RPC_URL`: RPC endpoint (e.g., `https://api.devnet.solana.com`).
- `SOLANA_PROGRAM_ID`: The ID of the xDRM program on Solana.

### Frontend (`.env`)
- `VITE_API_BASE_URL`: URL where the backend is running (e.g., `http://localhost:8000`).
- `VITE_SOLANA_NETWORK`: Target network (`devnet`, `testnet`, `mainnet-beta`).

---

## 🤝 Contribution

This project was developed for the **Solana Hackathon**. For any inquiries or collaboration, please reach out to the project maintainers via GitHub.

---

## ⚖️ License
This project is licensed under the MIT License - see the LICENSE file for details.
