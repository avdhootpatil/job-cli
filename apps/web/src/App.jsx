import React, { useState } from "react";
import SearchForm from "./components/SearchForm";
import JobList from "./components/JobList";
import JobDetail from "./components/JobDetail";
import CompanySearch from "./components/CompanySearch";
import "./App.css";

const TABS = [
  { id: "search", label: "Search Jobs" },
  { id: "remote", label: "Remote Jobs" },
  { id: "entry", label: "Entry Level" },
  { id: "companies", label: "Companies" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("search");
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const fetchJobs = async (endpoint, params) => {
    setLoading(true);
    setError(null);
    setJobs([]);
    setMeta(null);
    setSelectedJobId(null);
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v != null && v !== "")
        )
      ).toString();
      const res = await fetch(`${endpoint}?${qs}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setMeta({
        jobCount: data.jobCount,
        totalResults: data.totalResults,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>LinkedIn Job Search</h1>
        <p>Powered by LinkedIn MCP Server</p>
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => {
              setActiveTab(tab.id);
              setJobs([]);
              setMeta(null);
              setError(null);
              setSelectedJobId(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === "companies" ? (
          <CompanySearch />
        ) : (
          <>
            <SearchForm
              type={activeTab}
              onSearch={fetchJobs}
              loading={loading}
            />

            {error && <div className="error-banner">{error}</div>}

            {meta && (
              <div className="results-meta">
                Showing {jobs.length} of {meta.totalResults || "?"} results
              </div>
            )}

            <div className="results-layout">
              <JobList
                jobs={jobs}
                loading={loading}
                selectedId={selectedJobId}
                onSelect={setSelectedJobId}
              />
              {selectedJobId && <JobDetail jobId={selectedJobId} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
