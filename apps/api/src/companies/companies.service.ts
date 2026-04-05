import { Injectable } from "@nestjs/common";
import { callMcpTool } from "../mcp-client";

@Injectable()
export class CompaniesService {
  async searchCompanies(query: string) {
    return callMcpTool("search_companies", { query });
  }

  async getCompanyJobs(
    companyId: string,
    keywords?: string,
    limit?: string
  ) {
    return callMcpTool("get_company_jobs", {
      companyId,
      keywords: keywords || undefined,
      limit: parseInt(limit) || 10,
    });
  }
}
