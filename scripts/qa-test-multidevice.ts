/**
 * Automated Multi-Device QA Test Suite for Tranzora Web
 * Simulates multiple concurrent devices (Laptop, Mobile Phone, Tablet)
 * Testing Cross-Device Sync, Real-time Data Mutation, Authentication, and Multi-Tenancy.
 */

const BASE_URL = "http://localhost:3000";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
  durationMs: number;
};

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    process.stdout.write(`  ⏳ ${name}... `);
    await fn();
    const duration = Date.now() - start;
    console.log(`\x1b[32mPASSED\x1b[0m (${duration}ms)`);
    results.push({ name, passed: true, durationMs: duration });
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\x1b[31mFAILED\x1b[0m (${duration}ms)\n     Error: ${msg}`);
    results.push({ name, passed: false, details: msg, durationMs: duration });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runQA() {
  console.log("\n========================================================");
  console.log("🚀 STARTING TRANZORA MULTI-DEVICE QA TEST SUITE");
  console.log("========================================================\n");

  // Device states simulating local browser memory / cache
  let laptopWorkspace: string = "";
  let laptopDb: any = null;
  let mobileWorkspace: string = "";
  let mobileDb: any = null;
  let tabletWorkspace: string = "";
  let tabletDb: any = null;

  /* ---------------------------------------------------- SUITE 1 */
  console.log("\x1b[36m[SUITE 1: Multi-Device Login & Initial Sync]\x1b[0m");

  await runTest("1.1 Laptop signs in with admin@tranzora.com", async () => {
    const res = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        email: "admin@tranzora.com",
        password: "tranzora123",
      }),
    });
    assert(res.ok, `HTTP status ${res.status}`);
    assert(res.data.success === true, "Login must succeed");
    assert(res.data.workspace === "demo", `Expected workspace 'demo', got '${res.data.workspace}'`);
    assert(res.data.user.email === "admin@tranzora.com", "User email must match");
    assert(Array.isArray(res.data.db.collections.vehicles), "Vehicles collection must exist");
    laptopWorkspace = res.data.workspace;
    laptopDb = res.data.db;
  });

  await runTest("1.2 Mobile signs in simultaneously with same credentials", async () => {
    const res = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        email: "admin@tranzora.com",
        password: "tranzora123",
      }),
    });
    assert(res.ok, `HTTP status ${res.status}`);
    assert(res.data.success === true, "Mobile login must succeed");
    assert(res.data.workspace === laptopWorkspace, "Mobile and Laptop must connect to same workspace");
    mobileWorkspace = res.data.workspace;
    mobileDb = res.data.db;
    assert(mobileDb.collections.vehicles.length === laptopDb.collections.vehicles.length, "Vehicle counts must match initially");
  });

  /* ---------------------------------------------------- SUITE 2 */
  console.log("\n\x1b[36m[SUITE 2: Laptop Mutation -> Mobile Verification]\x1b[0m");

  const newVehicle = {
    id: `VHC-QA-${Date.now()}`,
    code: `VHC-QA-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    regNo: "DHA-METRO-QA-88-7777",
    type: "Heavy Multi-Axle Prime Mover",
    make: "Volvo FH16 750",
    year: 2024,
    capacity: "45 ton",
    fuelType: "Diesel",
    ownership: "Own",
    chassisNo: "VOLVOQA998877",
    engineNo: "ENGVOLVO750",
    odometer: 1250,
    branch: "Tejgaon Central Depot",
    driverId: "DRV-0001",
    status: "Available",
    notes: "Created from Laptop QA session",
  };

  await runTest("2.1 Laptop adds a new heavy transport vehicle to workspace", async () => {
    laptopDb.collections.vehicles.push(newVehicle);
    const commitRes = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "commit",
        workspace: laptopWorkspace,
        db: laptopDb,
      }),
    });
    assert(commitRes.ok, "Commit from Laptop must succeed");
    assert(commitRes.data.success === true, "Commit response must be success true");
  });

  await runTest("2.2 Mobile queries cloud storage and detects new vehicle added by Laptop", async () => {
    const syncRes = await api(`/api/storage?ws=${encodeURIComponent(mobileWorkspace)}`);
    assert(syncRes.ok, "Mobile sync query must succeed");
    assert(syncRes.data.success === true, "Sync response must be success true");
    mobileDb = syncRes.data.db;

    const found = mobileDb.collections.vehicles.find((v: any) => v.id === newVehicle.id);
    assert(!!found, `Vehicle ${newVehicle.id} (${newVehicle.regNo}) must exist on Mobile`);
    assert(found.regNo === "DHA-METRO-QA-88-7777", "Registration number must match");
    assert(found.make === "Volvo FH16 750", "Vehicle make must match");
    assert(found.notes === "Created from Laptop QA session", "Vehicle notes must match");
  });

  await runTest("2.3 Laptop updates Driver 0001 status & phone", async () => {
    const driver = laptopDb.collections.drivers.find((d: any) => d.id === "DRV-0001");
    assert(!!driver, "Driver DRV-0001 must exist");
    driver.status = "On Leave";
    driver.phone = "+880 1799 111 222";
    driver.updatedAt = new Date().toISOString();

    const commitRes = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "commit",
        workspace: laptopWorkspace,
        db: laptopDb,
      }),
    });
    assert(commitRes.data.success === true, "Commit from Laptop must succeed");
  });

  await runTest("2.4 Mobile queries cloud storage and sees driver status update", async () => {
    const syncRes = await api(`/api/storage?ws=${encodeURIComponent(mobileWorkspace)}`);
    mobileDb = syncRes.data.db;
    const driverOnMobile = mobileDb.collections.drivers.find((d: any) => d.id === "DRV-0001");
    assert(!!driverOnMobile, "Driver DRV-0001 must exist on Mobile");
    assert(driverOnMobile.status === "On Leave", `Expected status 'On Leave', got '${driverOnMobile.status}'`);
    assert(driverOnMobile.phone === "+880 1799 111 222", `Expected phone '+880 1799 111 222', got '${driverOnMobile.phone}'`);
  });

  /* ---------------------------------------------------- SUITE 3 */
  console.log("\n\x1b[36m[SUITE 3: Mobile Mutation -> Laptop Verification (Reverse Sync)]\x1b[0m");

  const newCustomer = {
    id: `CST-QA-${Date.now()}`,
    code: `CST-QA-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "Akij Bashir Logistics Global",
    contactPerson: "Mr. Tanvir Chowdhury",
    email: "shipping@akijbashir.com",
    phone: "+880 1819 000 111",
    address: "Akij House, 198 Bir Uttam Mir Shawkat Sarak, Dhaka",
    creditLimit: 5000000,
    balance: 0,
    status: "Active",
    notes: "Enterprise account added via Mobile phone",
  };

  await runTest("3.1 Mobile adds a new enterprise customer to workspace", async () => {
    mobileDb.collections.customers.push(newCustomer);
    const commitRes = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "commit",
        workspace: mobileWorkspace,
        db: mobileDb,
      }),
    });
    assert(commitRes.data.success === true, "Mobile commit must succeed");
  });

  await runTest("3.2 Laptop queries cloud storage and sees the new customer created by Mobile", async () => {
    const syncRes = await api(`/api/storage?ws=${encodeURIComponent(laptopWorkspace)}`);
    assert(syncRes.ok, "Laptop sync query must succeed");
    laptopDb = syncRes.data.db;

    const foundCustomer = laptopDb.collections.customers.find((c: any) => c.id === newCustomer.id);
    assert(!!foundCustomer, `Customer ${newCustomer.name} must exist on Laptop`);
    assert(foundCustomer.contactPerson === "Mr. Tanvir Chowdhury", "Contact person must match");
    assert(foundCustomer.creditLimit === 5000000, "Credit limit must match");
  });

  /* ---------------------------------------------------- SUITE 4 */
  console.log("\n\x1b[36m[SUITE 4: Multi-Tenant Workspace & Device Isolation]\x1b[0m");

  const newAdminEmail = `company_${Date.now()}@deltafreight.com`;

  await runTest("4.1 Tablet registers a new independent company (Delta Freight Ltd)", async () => {
    const regRes = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "register",
        name: "Shakib Al Hasan",
        email: newAdminEmail,
        password: "deltaPassword123",
        company: "Delta Freight Limited",
      }),
    });
    assert(regRes.ok, "Registration must succeed");
    assert(regRes.data.success === true, "Registration response must be success true");
    assert(regRes.data.workspace !== laptopWorkspace, "New company must receive a unique workspace");
    tabletWorkspace = regRes.data.workspace;
    tabletDb = regRes.data.db;
  });

  await runTest("4.2 Tablet workspace is completely isolated from Demo workspace", async () => {
    // Delta Freight should NOT have Demo's test vehicle DHA-METRO-QA-88-7777
    const foundOnTablet = tabletDb.collections.vehicles.find((v: any) => v.regNo === "DHA-METRO-QA-88-7777");
    assert(!foundOnTablet, "Delta Freight must NOT see Demo company's vehicles!");

    // Delta Freight should NOT have Demo's test customer
    const foundCustomerOnTablet = tabletDb.collections.customers.find((c: any) => c.name === "Akij Bashir Logistics Global");
    assert(!foundCustomerOnTablet, "Delta Freight must NOT see Demo company's customers!");
  });

  await runTest("4.3 Laptop workspace remains completely unaffected by Tablet registration", async () => {
    const syncRes = await api(`/api/storage?ws=${encodeURIComponent(laptopWorkspace)}`);
    laptopDb = syncRes.data.db;
    const userInDemo = laptopDb.collections.users.find((u: any) => u.email === newAdminEmail);
    assert(!userInDemo, "Delta Freight admin must NOT appear in Demo workspace users!");
  });

  /* ---------------------------------------------------- SUITE 5 */
  console.log("\n\x1b[36m[SUITE 5: Authentication Validation & Edge Cases]\x1b[0m");

  await runTest("5.1 Wrong password rejection", async () => {
    const res = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        email: "admin@tranzora.com",
        password: "wrong_password_123",
      }),
    });
    assert(!res.ok, "Must return HTTP 400 for wrong password");
    assert(res.data.success === false, "success must be false");
    assert(res.data.error.includes("incorrect"), "Error message must indicate incorrect credentials");
  });

  await runTest("5.2 Non-existent email rejection", async () => {
    const res = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        email: "nobody@unknown-domain.com",
        password: "anyPassword",
      }),
    });
    assert(!res.ok, "Must return HTTP 400 for non-existent email");
    assert(res.data.success === false, "success must be false");
    assert(res.data.error.includes("No account found"), "Error message must indicate account not found");
  });

  await runTest("5.3 Duplicate email registration rejection", async () => {
    const res = await api("/api/storage", {
      method: "POST",
      body: JSON.stringify({
        action: "register",
        name: "Duplicate User",
        email: newAdminEmail,
        password: "deltaPassword123",
      }),
    });
    assert(!res.ok, "Must reject duplicate email registration");
    assert(res.data.success === false, "success must be false");
    assert(res.data.error.includes("already exists"), "Error message must state account already exists");
  });

  // Cleanup test vehicle and test customer from demo workspace to keep demo clean
  laptopDb.collections.vehicles = laptopDb.collections.vehicles.filter((v: any) => v.id !== newVehicle.id);
  laptopDb.collections.customers = laptopDb.collections.customers.filter((c: any) => c.id !== newCustomer.id);
  const driverToReset = laptopDb.collections.drivers.find((d: any) => d.id === "DRV-0001");
  if (driverToReset) {
    driverToReset.status = "On Trip";
    driverToReset.phone = "+880 1710 400 100";
  }
  await api("/api/storage", {
    method: "POST",
    body: JSON.stringify({
      action: "commit",
      workspace: laptopWorkspace,
      db: laptopDb,
    }),
  });

  /* ---------------------------------------------------- SUMMARY */
  console.log("\n========================================================");
  console.log("📊 QA TEST EXECUTION SUMMARY");
  console.log("========================================================");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`Total Tests Run:  ${total}`);
  console.log(`Passed:           \x1b[32m${passed}\x1b[0m`);
  console.log(`Failed:           \x1b[${failed > 0 ? "31" : "32"}m${failed}\x1b[0m`);
  console.log(`Total Duration:   ${totalDuration}ms`);
  console.log("========================================================\n");

  if (failed > 0) {
    console.error("❌ QA Test Suite finished with failures.");
    process.exit(1);
  } else {
    console.log("✅ ALL QA TESTS PASSED! Multi-device synchronization verified 100% successfully!");
    process.exit(0);
  }
}

runQA().catch((err) => {
  console.error("Fatal QA Test Suite Error:", err);
  process.exit(1);
});
