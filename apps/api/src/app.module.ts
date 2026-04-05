import { Module } from "@nestjs/common";
import { JobsModule } from "./jobs/jobs.module";
import { CompaniesModule } from "./companies/companies.module";

@Module({
  imports: [JobsModule, CompaniesModule],
})
export class AppModule {}
