import React, { useState } from "react";

const DEFAULTS = {
  search: { keywords: "React JS, NodeJS, Fullstack", location: "India", workplaceType: "", experienceLevel: "", easyApply: "", limit: "50" },
  remote: { keywords: "React JS, NodeJS, Fullstack", limit: "50" },
  entry: { keywords: "React JS, NodeJS, Fullstack", location: "India", includeInternships: "true", limit: "50" },
};

const ENDPOINTS = {
  search: "/jobs/search",
  remote: "/jobs/remote",
  entry: "/jobs/entry-level",
};

export default function SearchForm({ type, onSearch, loading }) {
  const [form, setForm] = useState(DEFAULTS[type] || DEFAULTS.search);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(ENDPOINTS[type], form);
  };

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label>Keywords</label>
          <input
            type="text"
            placeholder="e.g. React Developer"
            value={form.keywords}
            onChange={handleChange("keywords")}
          />
        </div>

        {type !== "remote" && (
          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              placeholder="e.g. India, New York"
              value={form.location || ""}
              onChange={handleChange("location")}
            />
          </div>
        )}

        {type === "search" && (
          <>
            <div className="form-group">
              <label>Workplace</label>
              <select value={form.workplaceType} onChange={handleChange("workplaceType")}>
                <option value="">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="on-site">On-site</option>
              </select>
            </div>
            <div className="form-group">
              <label>Experience</label>
              <select value={form.experienceLevel} onChange={handleChange("experienceLevel")}>
                <option value="">Any</option>
                <option value="entry-level">Entry Level</option>
                <option value="mid-senior">Mid-Senior</option>
                <option value="director">Director</option>
                <option value="executive">Executive</option>
              </select>
            </div>
          </>
        )}

        {type === "search" && (
          <div className="form-group">
            <label>Easy Apply</label>
            <select value={form.easyApply || ""} onChange={handleChange("easyApply")}>
              <option value="">All</option>
              <option value="true">Easy Apply only</option>
            </select>
          </div>
        )}

        {type === "entry" && (
          <div className="form-group">
            <label>Internships</label>
            <select value={form.includeInternships} onChange={handleChange("includeInternships")}>
              <option value="true">Include</option>
              <option value="false">Exclude</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Limit</label>
          <select value={form.limit} onChange={handleChange("limit")}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>

      <button type="submit" className="search-btn" disabled={loading}>
        {loading ? "Searching..." : "Search LinkedIn"}
      </button>
    </form>
  );
}
