"use client";
import React, { useState } from "react";

export default function SettingsPage() {
  const [theme, setTheme] = useState("DARK");
  const [saveMessage, setSaveMessage] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage(true);
    setTimeout(() => setSaveMessage(false), 3000);
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="border-b border-[var(--border-primary)] pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">System Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Adjust visual styles, backend coordinate endpoints, and local interface properties.
        </p>
      </div>

      {saveMessage && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs">
          System settings saved successfully.
        </div>
      )}

      {/* Settings Panel */}
      <div className="bg-[var(--surface-primary)] border border-[var(--border-primary)] p-6 rounded-2xl shadow-sm">
        <form onSubmit={handleSaveSettings} className="space-y-6 text-xs">
          
          {/* Section 1 */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2">🌐 Connection Parameters</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-secondary)] font-bold uppercase tracking-wider">FastAPI Host URI</label>
              <input 
                type="text" 
                value={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"} 
                disabled
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-secondary)] font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-secondary)] font-bold uppercase tracking-wider">MongoDB Port Mapping</label>
              <input 
                type="text" 
                value="mongodb://127.0.0.1:27018" 
                disabled
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-secondary)] font-mono"
              />
            </div>
          </div>

          {/* Section 2 */}
          <div className="space-y-4 pt-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2">🎨 Visualization Preferences</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-secondary)] font-bold uppercase tracking-wider">Interface Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-primary)] focus:outline-none"
              >
                <option value="DARK">Charcoal & Platinum Silver Dark (Active)</option>
                <option value="LIGHT">Classic Operational Light</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-secondary)] font-bold uppercase tracking-wider">WebGL Frame Cap</label>
              <select
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-primary)] focus:outline-none"
                disabled
              >
                <option value="60">60 FPS (V-Sync Map Rendering)</option>
                <option value="30">30 FPS (Energy Saver Mode)</option>
              </select>
            </div>
          </div>

          {/* Submit */}
          <button 
            type="submit"
            className="w-full mt-4 p-3 btn-primary rounded-xl font-bold text-xs transition-all active:scale-[0.98]"
          >
            Apply Preference Configurations
          </button>

        </form>
      </div>
    </div>
  );
}
