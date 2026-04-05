import React, { useState } from "react";

export default function CompanySearch() {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/companies/search?query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form className="search-form" onSubmit={handleSearch}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Company Name</label>
            <input
              type="text"
              placeholder="e.g. Google, Microsoft"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="search-btn" disabled={loading}>
          {loading ? "Searching..." : "Search Companies"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="loading-spinner">Searching...</div>}

      <div className="company-grid">
        {companies.map((c, i) => (
          <div key={c.id || i} className="company-card">
            <h3>{c.name}</h3>
            {c.industry && <div className="industry">{c.industry}</div>}
            {c.linkedInUrl && (
              <a href={c.linkedInUrl} target="_blank" rel="noopener noreferrer">
                View on LinkedIn
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
