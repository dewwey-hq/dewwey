import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertDatabaseAccessAllowed, isProdDatabaseHost } from "./db.js";

describe("isProdDatabaseHost", () => {
  it("matches hosts with 'prod' in them", () => {
    expect(isProdDatabaseHost("wedding-app-prod-db.abc123.us-east-1.rds.amazonaws.com")).toBe(true);
  });

  it("does not match beta hosts", () => {
    expect(isProdDatabaseHost("wedding-app-beta-db.abc123.us-east-1.rds.amazonaws.com")).toBe(false);
  });

  it("does not match an empty/undefined host", () => {
    expect(isProdDatabaseHost("")).toBe(false);
    expect(isProdDatabaseHost(undefined)).toBe(false);
  });
});

describe("assertDatabaseAccessAllowed", () => {
  const originalHost = process.env.DB_HOST;
  const originalAllowProd = process.env.ALLOW_PROD_DB;

  beforeEach(() => {
    delete process.env.DB_HOST;
    delete process.env.ALLOW_PROD_DB;
  });

  afterEach(() => {
    if (originalHost === undefined) delete process.env.DB_HOST;
    else process.env.DB_HOST = originalHost;
    if (originalAllowProd === undefined) delete process.env.ALLOW_PROD_DB;
    else process.env.ALLOW_PROD_DB = originalAllowProd;
  });

  it("throws when pointed at a prod host without ALLOW_PROD_DB", () => {
    process.env.DB_HOST = "wedding-app-prod-db.abc123.us-east-1.rds.amazonaws.com";
    expect(() => assertDatabaseAccessAllowed()).toThrow(/Refusing to connect to production database/);
  });

  it("allows a prod host when ALLOW_PROD_DB=true", () => {
    process.env.DB_HOST = "wedding-app-prod-db.abc123.us-east-1.rds.amazonaws.com";
    process.env.ALLOW_PROD_DB = "true";
    expect(() => assertDatabaseAccessAllowed()).not.toThrow();
  });

  it("allows a beta host with no ALLOW_PROD_DB set", () => {
    process.env.DB_HOST = "wedding-app-beta-db.abc123.us-east-1.rds.amazonaws.com";
    expect(() => assertDatabaseAccessAllowed()).not.toThrow();
  });

  it("is a no-op when DB_HOST is unset", () => {
    expect(() => assertDatabaseAccessAllowed()).not.toThrow();
  });
});
