#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import ora from "ora";
import readline from "readline";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = path.join(
  __dirname,
  "packages/linkedin-mcp-search/dist/index.js"
);

function banner() {
  console.clear();
  console.log(
    chalk.blueBright.bold(`
+=================================================+
|       LinkedIn Job Search CLI                    |
|       Powered by MCP Server                      |
+=================================================+
`)
  );
}

function divider() {
  console.log(chalk.gray("-".repeat(50)));
}

function printJob(job, index) {
  console.log(chalk.cyan.bold(`\n[${index + 1}] ${job.title}`));
  console.log(chalk.white(`    Company:  ${job.company}`));
  console.log(chalk.white(`    Location: ${job.location}`));
  if (job.workplaceType && job.workplaceType !== "unknown") {
    const wt = job.workplaceType;
    const color =
      wt === "remote" ? "green" : wt === "hybrid" ? "yellow" : "white";
    console.log(
      chalk[color](`    Type:     ${wt.charAt(0).toUpperCase() + wt.slice(1)}`)
    );
  }
  if (job.salary) console.log(chalk.green(`    Salary:   ${job.salary}`));
  console.log(chalk.gray(`    Posted:   ${job.postedTimeAgo}`));
  if (job.isEasyApply) console.log(chalk.blue(`    [Easy Apply]`));
  console.log(chalk.gray(`    URL:      ${job.url}`));
}

function printJobDetails(job) {
  console.log(chalk.cyan.bold(`\n${job.title}`));
  divider();
  console.log(chalk.white(`Company:    ${job.company}`));
  console.log(chalk.white(`Location:   ${job.location}`));
  if (job.employmentType)
    console.log(chalk.white(`Type:       ${job.employmentType}`));
  if (job.seniorityLevel)
    console.log(chalk.white(`Seniority:  ${job.seniorityLevel}`));
  if (job.salary) console.log(chalk.green(`Salary:     ${job.salary}`));
  if (job.applicants)
    console.log(chalk.yellow(`Applicants: ${job.applicants}`));
  if (job.isEasyApply) console.log(chalk.blue(`[Easy Apply]`));
  console.log(chalk.gray(`URL:        ${job.url}`));
  if (job.description) {
    divider();
    console.log(chalk.white.bold("Description:"));
    const desc = job.description
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    console.log(
      chalk.gray(
        desc.slice(0, 1000) + (desc.length > 1000 ? "\n... (truncated)" : "")
      )
    );
  }
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(chalk.yellow(question), resolve));
}

async function callTool(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text;
  if (!text) throw new Error("Empty response from MCP server");
  return JSON.parse(text);
}

async function showMenu(rl) {
  console.log(chalk.white.bold("\nWhat would you like to do?\n"));
  const options = [
    "Search jobs (full filters)",
    "Search remote jobs",
    "Search entry-level / internship jobs",
    "Get job details by ID",
    "Search companies",
    "Get jobs at a company",
  ];
  options.forEach((opt, i) =>
    console.log(chalk.cyan(`  ${i + 1}`) + chalk.white(`  ${opt}`))
  );
  console.log(chalk.cyan("  0") + chalk.white("  Exit"));
  divider();
  return await ask(rl, "\nEnter choice: ");
}

async function doSearchJobs(client, rl) {
  console.log(chalk.white.bold("\nFull Job Search"));
  divider();
  const keywords = await ask(rl, "Keywords (e.g. Python Developer): ");
  const location = await ask(rl, "Location [Enter to skip]: ");
  const remote = await ask(rl, "Workplace - remote/hybrid/on-site [Enter to skip]: ");
  const level = await ask(rl, "Experience - entry-level/mid-senior/director [Enter to skip]: ");
  const datePost = await ask(rl, "Posted - past-24-hours/past-week/past-month [Enter=any]: ");
  const easyApply = await ask(rl, "Easy Apply only? (y/n) [Enter=no]: ");
  const limit = await ask(rl, "Max results (1-50) [Enter=10]: ");

  const args = { keywords: keywords || "developer" };
  if (location.trim()) args.location = location.trim();
  if (remote.trim()) args.workplaceType = [remote.trim()];
  if (level.trim()) args.experienceLevel = [level.trim()];
  if (datePost.trim()) args.datePosted = datePost.trim();
  if (easyApply.trim().toLowerCase() === "y") args.easyApply = true;
  args.limit = parseInt(limit.trim()) || 10;

  const spinner = ora(chalk.blue("Searching LinkedIn...")).start();
  try {
    const data = await callTool(client, "search_jobs", args);
    spinner.succeed(
      chalk.green(`Found ${data.jobCount} jobs (${data.totalResults} total)`)
    );
    if (data.jobs?.length) data.jobs.forEach((job, i) => printJob(job, i));
    else console.log(chalk.yellow("\nNo jobs found. Try broader filters."));
  } catch (e) {
    spinner.fail(chalk.red("Search failed: " + e.message));
  }
}

async function doSearchRemote(client, rl) {
  console.log(chalk.white.bold("\nRemote Job Search"));
  divider();
  const keywords = await ask(rl, "Keywords (e.g. React Developer): ");
  const datePost = await ask(rl, "Posted - past-24-hours/past-week/past-month [Enter=past-week]: ");
  const limit = await ask(rl, "Max results [Enter=10]: ");

  const spinner = ora(chalk.blue("Searching remote jobs...")).start();
  try {
    const data = await callTool(client, "search_remote_jobs", {
      keywords: keywords || "developer",
      datePosted: datePost.trim() || "past-week",
      limit: parseInt(limit.trim()) || 10,
    });
    spinner.succeed(chalk.green(`Found ${data.jobCount} remote jobs`));
    if (data.jobs?.length) data.jobs.forEach((job, i) => printJob(job, i));
    else console.log(chalk.yellow("\nNo remote jobs found."));
  } catch (e) {
    spinner.fail(chalk.red("Search failed: " + e.message));
  }
}

async function doEntryLevel(client, rl) {
  console.log(chalk.white.bold("\nEntry-Level / Internship Search"));
  divider();
  const keywords = await ask(rl, "Keywords (e.g. Data Analyst): ");
  const location = await ask(rl, "Location [Enter to skip]: ");
  const internships = await ask(rl, "Include internships? (y/n) [Enter=yes]: ");
  const limit = await ask(rl, "Max results [Enter=10]: ");

  const spinner = ora(chalk.blue("Searching entry-level jobs...")).start();
  try {
    const data = await callTool(client, "search_entry_level_jobs", {
      keywords: keywords || "developer",
      location: location.trim() || undefined,
      includeInternships: internships.trim().toLowerCase() !== "n",
      limit: parseInt(limit.trim()) || 10,
    });
    spinner.succeed(chalk.green(`Found ${data.jobCount} entry-level jobs`));
    if (data.jobs?.length) data.jobs.forEach((job, i) => printJob(job, i));
    else console.log(chalk.yellow("\nNo entry-level jobs found."));
  } catch (e) {
    spinner.fail(chalk.red("Search failed: " + e.message));
  }
}

async function doJobDetails(client, rl) {
  console.log(chalk.white.bold("\nGet Job Details"));
  divider();
  const jobId = await ask(rl, "Enter LinkedIn Job ID (numbers from URL): ");

  const spinner = ora(chalk.blue("Fetching job details...")).start();
  try {
    const data = await callTool(client, "get_job_details", {
      jobId: jobId.trim(),
    });
    spinner.succeed(chalk.green("Job found!"));
    if (data.success && data.job) printJobDetails(data.job);
    else console.log(chalk.yellow("\nJob not found."));
  } catch (e) {
    spinner.fail(chalk.red("Failed: " + e.message));
  }
}

async function doSearchCompanies(client, rl) {
  console.log(chalk.white.bold("\nSearch Companies"));
  divider();
  const query = await ask(rl, "Company name (e.g. Google): ");

  const spinner = ora(chalk.blue("Searching companies...")).start();
  try {
    const data = await callTool(client, "search_companies", {
      query: query.trim(),
    });
    spinner.succeed(chalk.green(`Found ${data.count} companies`));
    data.companies?.forEach((c, i) => {
      console.log(chalk.cyan.bold(`\n[${i + 1}] ${c.name}`));
      if (c.industry) console.log(chalk.white(`    Industry: ${c.industry}`));
      console.log(chalk.gray(`    URL: ${c.linkedInUrl}`));
      console.log(chalk.gray(`    ID:  ${c.id}`));
    });
  } catch (e) {
    spinner.fail(chalk.red("Search failed: " + e.message));
  }
}

async function doCompanyJobs(client, rl) {
  console.log(chalk.white.bold("\nJobs at a Company"));
  divider();
  const companyId = await ask(rl, "Company ID (from search companies): ");
  const keywords = await ask(rl, "Filter keywords [Enter to skip]: ");
  const limit = await ask(rl, "Max results [Enter=10]: ");

  const spinner = ora(chalk.blue("Fetching company jobs...")).start();
  try {
    const data = await callTool(client, "get_company_jobs", {
      companyId: companyId.trim(),
      keywords: keywords.trim() || undefined,
      limit: parseInt(limit.trim()) || 10,
    });
    spinner.succeed(chalk.green(`Found ${data.jobCount} jobs`));
    if (data.jobs?.length) data.jobs.forEach((job, i) => printJob(job, i));
    else console.log(chalk.yellow("\nNo jobs found at this company."));
  } catch (e) {
    spinner.fail(chalk.red("Failed: " + e.message));
  }
}

async function main() {
  banner();

  const spinner = ora(chalk.blue("Starting LinkedIn MCP Server...")).start();
  const transport = new StdioClientTransport({
    command: "node",
    args: [MCP_SERVER_PATH],
  });
  const client = new Client(
    { name: "linkedin-job-cli", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    spinner.succeed(chalk.green("MCP Server connected!"));
  } catch (e) {
    spinner.fail(chalk.red("Failed to start MCP server: " + e.message));
    console.log(
      chalk.yellow(
        "\nMake sure the MCP server is built: cd ../linkedin-mcp-search && npm run build"
      )
    );
    process.exit(1);
  }

  const { tools } = await client.listTools();
  console.log(
    chalk.gray(
      `\n${tools.length} tools available: ${tools.map((t) => t.name).join(", ")}`
    )
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("close", async () => {
    console.log(chalk.gray("\nGoodbye!"));
    await client.close();
    process.exit(0);
  });

  while (true) {
    const choice = await showMenu(rl);
    switch (choice.trim()) {
      case "1":
        await doSearchJobs(client, rl);
        break;
      case "2":
        await doSearchRemote(client, rl);
        break;
      case "3":
        await doEntryLevel(client, rl);
        break;
      case "4":
        await doJobDetails(client, rl);
        break;
      case "5":
        await doSearchCompanies(client, rl);
        break;
      case "6":
        await doCompanyJobs(client, rl);
        break;
      case "0":
        rl.close();
        return;
      default:
        console.log(chalk.red("\nInvalid choice. Try again."));
    }
    await ask(rl, chalk.gray("\nPress Enter to continue..."));
    banner();
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
