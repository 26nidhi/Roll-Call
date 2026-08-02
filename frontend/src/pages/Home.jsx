import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Who's checking in?</h1>
        <p className="text-ink/60 mt-2">
          Teachers run the session. Students scan the QR and verify with a quick face check.
        </p>
      </div>

      <div className="grid gap-4">
        <Link to="/teacher/login" className="card hover:border-accent/50 transition">
          <p className="font-display font-bold text-lg">I'm a teacher</p>
          <p className="text-sm text-ink/60 mt-1">Start a session and show the QR code to your class.</p>
        </Link>

        <Link to="/student/login" className="card hover:border-accent/50 transition">
          <p className="font-display font-bold text-lg">I'm a student</p>
          <p className="text-sm text-ink/60 mt-1">Scan the QR and verify with your face to check in.</p>
        </Link>
      </div>
    </div>
  );
}
