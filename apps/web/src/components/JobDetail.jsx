import React, { useState, useEffect } from "react";

export default function JobDetail({ jobId }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    fetch(`/jobs/${jobId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data) => setJob(data.job || data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="job-detail loading-spinner">Loading details...</div>;
  if (error) return <div className="job-detail error-banner">{error}</div>;
  if (!job) return null;

  const desc = job.description
    ? job.description.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
    : "";

  return (
    <div className="job-detail">
      <h2>{job.title}</h2>
      <div className="detail-company">{job.company}</div>

      <div className="detail-meta">
        {job.location && <span>Location: {job.location}</span>}
        {job.employmentType && <span>Type: {job.employmentType}</span>}
        {job.seniorityLevel && <span>Level: {job.seniorityLevel}</span>}
        {job.salary && <span>Salary: {job.salary}</span>}
        {job.applicants && <span>Applicants: {job.applicants}</span>}
      </div>

      {desc && <div className="description">{desc}</div>}

      {job.url && (
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="apply-btn"
        >
          View on LinkedIn
        </a>
      )}
    </div>
  );
}
