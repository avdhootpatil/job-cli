import React from "react";

function getWorkplaceClass(type) {
  if (!type || type === "unknown") return null;
  if (type === "remote") return "remote";
  if (type === "hybrid") return "hybrid";
  return "onsite";
}

export default function JobList({ jobs, loading, selectedId, onSelect }) {
  if (loading) {
    return <div className="loading-spinner">Searching LinkedIn...</div>;
  }

  if (!jobs.length) {
    return (
      <div className="empty-state">
        <h3>No jobs to display</h3>
        <p>Use the search form above to find jobs</p>
      </div>
    );
  }

  return (
    <div className="job-list">
      {jobs.map((job, i) => {
        const wpClass = getWorkplaceClass(job.workplaceType);
        return (
          <div
            key={job.jobId || i}
            className={`job-card ${selectedId === job.jobId ? "selected" : ""}`}
            onClick={() => {
              if (job.url) window.open(job.url, '_blank');
              onSelect(job.jobId);
            }}
          >
            <h3>{job.title}</h3>
            <div className="company">{job.company}</div>
            <div className="location">{job.location}</div>
            <div className="tags">
              {wpClass && (
                <span className={`tag ${wpClass}`}>{job.workplaceType}</span>
              )}
              {job.isEasyApply && (
                <span className="tag easy-apply">Easy Apply</span>
              )}
              {job.salary && <span className="tag salary">{job.salary}</span>}
            </div>
            <div className="posted">{job.postedTimeAgo}</div>
          </div>
        );
      })}
    </div>
  );
}
