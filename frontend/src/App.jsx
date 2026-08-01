import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import TeacherLogin from "./pages/TeacherLogin.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import StudentLogin from "./pages/StudentLogin.jsx";
import StudentRegister from "./pages/StudentRegister.jsx";
import StudentScan from "./pages/StudentScan.jsx";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-display font-bold text-lg tracking-tight">
          Roll Call
        </Link>
        <span className="text-xs text-ink/40 uppercase tracking-wide">QR + Face Attendance</span>
      </header>

      <main className="max-w-md mx-auto px-4 py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/student/login" element={<StudentLogin />} />
          <Route path="/student/register" element={<StudentRegister />} />
          <Route path="/student/scan" element={<StudentScan />} />
        </Routes>
      </main>
    </div>
  );
}
