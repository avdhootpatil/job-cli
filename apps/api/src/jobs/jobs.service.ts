import { Injectable } from "@nestjs/common";
import { callMcpTool } from "../mcp-client";

@Injectable()
export class JobsService {
  async searchJobs(query: {
    keywords?: string;
    location?: string;
    workplaceType?: string;
    experienceLevel?: string;
    datePosted?: string;
    easyApply?: string;
    limit?: string;
  }) {
    const args: Record<string, any> = {
      keywords: query.keywords || "developer",
      limit: parseInt(query.limit) || 10,
    };
    if (query.location) args.location = query.location;
    if (query.workplaceType) args.workplaceType = [query.workplaceType];
    if (query.experienceLevel) args.experienceLevel = [query.experienceLevel];
    if (query.datePosted) args.datePosted = query.datePosted;
    if (query.easyApply === "true") args.easyApply = true;
    return callMcpTool("search_jobs", args);
  }

  async searchRemoteJobs(query: {
    keywords?: string;
    datePosted?: string;
    limit?: string;
  }) {
    return callMcpTool("search_remote_jobs", {
      keywords: query.keywords || "developer",
      datePosted: query.datePosted || "past-week",
      limit: parseInt(query.limit) || 10,
    });
  }

  async searchEntryLevelJobs(query: {
    keywords?: string;
    location?: string;
    includeInternships?: string;
    limit?: string;
  }) {
    return callMcpTool("search_entry_level_jobs", {
      keywords: query.keywords || "developer",
      location: query.location || undefined,
      includeInternships: query.includeInternships !== "false",
      limit: parseInt(query.limit) || 10,
    });
  }

  async getJobDetails(jobId: string) {
    return callMcpTool("get_job_details", { jobId });
  }
}
