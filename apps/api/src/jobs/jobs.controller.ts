import { Controller, Get, Param, Query } from "@nestjs/common";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("search")
  searchJobs(
    @Query("keywords") keywords?: string,
    @Query("location") location?: string,
    @Query("workplaceType") workplaceType?: string,
    @Query("experienceLevel") experienceLevel?: string,
    @Query("datePosted") datePosted?: string,
    @Query("easyApply") easyApply?: string,
    @Query("limit") limit?: string
  ) {
    return this.jobsService.searchJobs({
      keywords,
      location,
      workplaceType,
      experienceLevel,
      datePosted,
      easyApply,
      limit,
    });
  }

  @Get("remote")
  searchRemoteJobs(
    @Query("keywords") keywords?: string,
    @Query("datePosted") datePosted?: string,
    @Query("limit") limit?: string
  ) {
    return this.jobsService.searchRemoteJobs({ keywords, datePosted, limit });
  }

  @Get("entry-level")
  searchEntryLevelJobs(
    @Query("keywords") keywords?: string,
    @Query("location") location?: string,
    @Query("includeInternships") includeInternships?: string,
    @Query("limit") limit?: string
  ) {
    return this.jobsService.searchEntryLevelJobs({
      keywords,
      location,
      includeInternships,
      limit,
    });
  }

  @Get(":jobId")
  getJobDetails(@Param("jobId") jobId: string) {
    return this.jobsService.getJobDetails(jobId);
  }
}
