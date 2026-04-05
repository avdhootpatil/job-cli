import { Controller, Get, Param, Query } from "@nestjs/common";
import { CompaniesService } from "./companies.service";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get("search")
  searchCompanies(@Query("query") query: string) {
    return this.companiesService.searchCompanies(query);
  }

  @Get(":companyId/jobs")
  getCompanyJobs(
    @Param("companyId") companyId: string,
    @Query("keywords") keywords?: string,
    @Query("limit") limit?: string
  ) {
    return this.companiesService.getCompanyJobs(companyId, keywords, limit);
  }
}
