import { docStatus, type CollectionKey, type Rec } from "./schema";

/**
 * Demo data written to the local store on first use (and on "Reset demo data"). Records are
 * linked to each other — trips point to real vehicles, drivers, customers and routes; invoices to
 * trips; payments to invoices — so every list, detail page and report shows consistent figures.
 */

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const stamp = (offsetDays: number, hour = 10) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, (offsetDays * 7) % 60, 0, 0);
  return d.toISOString();
};
const pick = <T,>(list: readonly T[], i: number) => list[((i % list.length) + list.length) % list.length]!;
const code = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

export type SeedResult = { collections: Record<CollectionKey, Rec[]>; seq: Record<string, number> };

export function buildSeed(): SeedResult {
  const seq: Record<string, number> = {};
  const make = (key: CollectionKey, prefix: string, data: Record<string, unknown>, ageDays = 0): Rec => {
    seq[key] = (seq[key] ?? 0) + 1;
    const created = stamp(-Math.abs(ageDays) - 1, 9 + (seq[key]! % 8));
    return { id: code(prefix, seq[key]!), code: code(prefix, seq[key]!), createdAt: created, updatedAt: created, ...data };
  };

  const drivers: Rec[] = [];
  const vehicles: Rec[] = [];
  const names = ["Arif Hossain", "Rafiq Ahmed", "Tanvir Hasan", "Mehedi Rahman", "Sakib Islam", "Jahid Hasan", "Kamrul Islam", "Shafiqul Islam", "Nazmul Karim", "Rubel Mia", "Sohel Rana", "Masud Parvez"];
  const branches = ["Tejgaon Central Depot", "Chattogram Port Depot", "Bogura Northern Hub", "Khulna South Hub", "Sylhet East Hub"];
  const vTypes = ["Truck (10 Ton)", "Covered Van (16 Ft)", "Prime Mover Trailer", "Covered Van (20 Ft)", "Open Truck (20 Ft)", "Mini Pickup (1.5 Ton)", "Refrigerated Van", "AC Coaster Bus"];
  const makes = ["Tata LPT 1618", "Ashok Leyland Ecomet", "Hino FM 2632", "Isuzu NPR", "Tata LPT 2518", "Mahindra Bolero Pickup", "Isuzu NQR Reefer", "Toyota Coaster"];
  const caps = ["10 ton", "7 ton", "25 ton", "12 ton", "15 ton", "1.5 ton", "5 ton", "29 seats"];
  const vStatus = ["On Trip", "Available", "On Trip", "Maintenance", "Assigned", "Available", "On Trip", "Available", "Inactive", "Available", "On Trip", "Assigned"];
  const dStatus = ["On Trip", "Available", "On Trip", "Available", "Available", "On Leave", "On Trip", "Available", "Available", "Inactive", "On Trip", "Available"];

  for (let i = 0; i < 12; i++) {
    drivers.push(
      make("drivers", "DRV", {
        name: names[i],
        employeeId: `EMP-${1001 + i}`,
        phone: `+880 17${10 + i} ${400 + i * 13} ${100 + i * 7}`,
        emergencyPhone: `+880 18${20 + i} ${300 + i * 11} ${200 + i * 5}`,
        nid: `19${88 + (i % 10)}${4210000 + i * 1371}`,
        licenseNo: `DK-${8000 + i * 37}-${2019 + (i % 5)}`,
        licenseClass: pick(["Heavy", "Heavy", "Medium", "Light", "Professional"], i),
        licenseExpiry: iso([420, 18, 600, 9, 900, -12, 240, 380, 25, 700, 510, 150][i]!),
        joinDate: iso(-900 + i * 55),
        salary: 22000 + (i % 5) * 2500,
        branch: pick(branches, i),
        rating: Math.round((4.9 - (i % 6) * 0.25) * 10) / 10,
        status: dStatus[i],
        address: `${12 + i} Road ${3 + (i % 7)}, ${pick(["Tejgaon", "Uttara", "Mirpur", "Agrabad", "Gazipur"], i)}`,
      }, 900 - i * 55),
    );
  }
  for (let i = 0; i < 12; i++) {
    vehicles.push(
      make("vehicles", "VHC", {
        regNo: `${pick(["DHA-METRO-TA", "DHA-METRO-DA", "CTG-METRO-TA", "DHA-METRO-NA"], i)}-${11 + i}-${4321 + i * 127}`,
        type: pick(vTypes, i),
        make: pick(makes, i),
        year: 2017 + (i % 8),
        capacity: pick(caps, i),
        fuelType: i === 7 ? "Diesel" : pick(["Diesel", "Diesel", "Diesel", "CNG"], i),
        ownership: pick(["Own", "Own", "Leased", "Own", "Partner"], i),
        chassisNo: `MAT${448000 + i * 913}C${10 + i}`,
        engineNo: `ENG${697000 + i * 471}`,
        odometer: 42000 + i * 9850,
        branch: pick(branches, i),
        driverId: drivers[i]!.id,
        status: vStatus[i],
        notes: "",
      }, 1100 - i * 60),
    );
  }
  drivers.forEach((d, i) => (d.vehicleId = vehicles[i]!.id));

  const customers: Rec[] = [];
  const cNames = ["Apex Textiles Ltd.", "Square Pharmaceuticals", "BSRM Steels", "Pran Foods Ltd.", "Akij Food & Beverage", "Bashundhara Paper Mills", "Walton Hi-Tech", "Meghna Group", "ACI Logistics", "Unilever Bangladesh", "Partex Furniture", "City Group"];
  const contacts = ["Nazmul Karim", "Farhana Yasmin", "Rezaul Karim", "Sabina Akter", "Imran Hossain", "Tahmina Begum", "Shahidul Alam", "Nusrat Jahan", "Fahim Rahman", "Mahbub Alam", "Lutfur Rahman", "Shirin Akter"];
  const cities = ["Gazipur", "Dhaka", "Chattogram", "Narayanganj", "Dhaka", "Dhaka", "Gazipur", "Narayanganj", "Dhaka", "Chattogram", "Dhaka", "Narayanganj"];
  for (let i = 0; i < 12; i++) {
    customers.push(
      make("customers", "CUS", {
        name: cNames[i],
        category: pick(["Manufacturer", "Manufacturer", "Exporter", "Distributor", "Manufacturer", "Freight Forwarder"], i),
        contactPerson: contacts[i],
        phone: `+880 18${11 + i} ${220 + i * 9} ${330 + i * 3}`,
        email: `logistics@${cNames[i]!.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12)}.com`,
        city: cities[i],
        address: `Plot ${20 + i * 4}, ${cities[i]} Industrial Area`,
        bin: `00${2148291 + i * 3917}-0102`,
        paymentTerms: pick(["30 Days Net", "15 Days Net", "Cash on Delivery", "45 Days Net", "7 Days Net"], i),
        creditLimit: 300000 + (i % 6) * 100000,
        status: i === 11 ? "Inactive" : "Active",
      }, 700 - i * 40),
    );
  }

  const routes: Rec[] = [];
  const rDefs: [string, string, number, number, number][] = [
    ["Dhaka", "Chattogram Port", 248, 7, 1800],
    ["Gazipur", "Chattogram Port", 275, 8, 2100],
    ["Dhaka", "Sylhet", 240, 6, 900],
    ["Dhaka", "Khulna", 270, 6, 2400],
    ["Narayanganj", "Mongla Port", 310, 8, 2600],
    ["Dhaka", "Rajshahi", 255, 6, 1200],
    ["Dhaka", "Bogura", 195, 5, 800],
    ["Chattogram", "Cox's Bazar", 152, 4, 400],
    ["Dhaka", "Cumilla", 97, 3, 600],
    ["Dhaka", "Mymensingh", 120, 3, 300],
    ["Dhaka", "Rangpur", 305, 8, 1100],
    ["Khulna", "Benapole", 105, 3, 350],
  ];
  rDefs.forEach(([o, d, km, hrs, toll], i) =>
    routes.push(
      make("routes", "RTE", {
        name: `${o} → ${d}`,
        origin: o,
        destination: d,
        via: pick(["Dhaka–Chattogram Highway", "Padma Bridge", "Bangabandhu Bridge", "N2 Highway", "Kanchpur Bridge"], i),
        distanceKm: km,
        durationHrs: hrs,
        toll,
        rate: km * 140,
        status: i === 11 ? "Inactive" : "Active",
        notes: "",
      }, 600 - i * 30),
    ),
  );

  const bookings: Rec[] = [];
  const bStatus = ["Assigned", "Assigned", "Completed", "Confirmed", "Assigned", "Pending", "Completed", "Assigned", "Cancelled", "Confirmed", "Completed", "Pending"];
  const goods = ["Garments export cartons", "Pharmaceutical consignment", "Steel rods (MS bar)", "Packaged food", "Beverage crates", "Paper rolls", "Electronics (refrigerators)", "Cement bags", "FMCG cartons", "Detergent cartons", "Furniture", "Edible oil drums"];
  for (let i = 0; i < 12; i++) {
    const r = routes[i % routes.length]!;
    bookings.push(
      make("bookings", "BKG", {
        customerId: customers[i]!.id,
        contact: `${contacts[i]} (${customers[i]!.phone})`,
        pickup: `${r.origin} — ${customers[i]!.name} warehouse`,
        dropoff: String(r.destination),
        pickupDate: iso(i - 8),
        deliveryDate: iso(i - 6),
        vehicleType: pick(vTypes, i),
        goods: goods[i],
        weight: `${(4 + (i % 7) * 1.5).toFixed(1)} ton`,
        priority: pick(["Medium", "High", "Low", "Urgent", "Medium"], i),
        quote: Number(r.rate) + 4000,
        advancePaid: i % 3 === 0 ? 10000 : 0,
        status: bStatus[i],
        notes: "Handle with care; keep cartons dry.",
      }, 20 - i),
    );
  }

  const trips: Rec[] = [];
  const tStatus = ["In Progress", "Dispatched", "Completed", "Approved", "In Progress", "Planned", "Completed", "In Progress", "Cancelled", "Completed", "Completed", "Draft", "Completed", "Completed"];
  for (let i = 0; i < 14; i++) {
    const r = routes[i % routes.length]!;
    const ci = i % 12;
    const status = tStatus[i]!;
    const start = i < 12 ? i - 9 : -20 - i;
    trips.push(
      make("trips", "TRP", {
        bookingId: i < 12 ? bookings[i]!.id : undefined,
        customerId: customers[ci]!.id,
        routeId: r.id,
        pickup: `${r.origin} — ${customers[ci]!.name} warehouse`,
        dropoff: String(r.destination),
        vehicleId: vehicles[i % 12]!.id,
        driverId: drivers[i % 12]!.id,
        helper: pick(["Rakib", "Sumon", "Babul", "Jewel", "Liton"], i),
        goods: goods[ci],
        weight: `${(4 + (i % 7) * 1.5).toFixed(1)} ton`,
        startDate: iso(start),
        endDate: ["Completed", "Cancelled"].includes(status) ? iso(start + 1) : undefined,
        distanceKm: r.distanceKm,
        startOdometer: Number(vehicles[i % 12]!.odometer) - 600 + i * 15,
        fare: Number(r.rate) + 4000,
        advance: 8000 + (i % 4) * 2000,
        status,
        notes: "Collect POD with receiver signature and seal.",
      }, -start),
    );
  }

  const cats: Rec[] = [];
  const catDefs: [string, string, number][] = [
    ["Diesel & Fuel", "Vehicle", 250000],
    ["Bridge & Road Toll", "Operational", 60000],
    ["Driver Allowance", "Staff", 80000],
    ["Repair & Spares", "Vehicle", 150000],
    ["Loading / Unloading", "Operational", 40000],
    ["Parking & Terminal Fee", "Operational", 15000],
    ["Insurance Premium", "Vehicle", 90000],
    ["Office & Utilities", "Administrative", 35000],
    ["Police & Permit Fees", "Operational", 20000],
    ["Food & Accommodation", "Staff", 30000],
    ["Tyres", "Vehicle", 120000],
    ["Miscellaneous", "Administrative", 10000],
  ];
  catDefs.forEach(([name, group, limit], i) => cats.push(make("expenseCategories", "ECT", { name, group, monthlyLimit: limit, description: `${name} for transport operations`, status: "Active" }, 400 - i)));

  const fuel: Rec[] = [];
  for (let i = 0; i < 14; i++) {
    const t = trips[i % trips.length]!;
    const litres = 60 + (i % 6) * 15;
    const rate = 109 + (i % 3);
    fuel.push(
      make("fuel", "FUL", {
        vehicleId: t.vehicleId,
        driverId: t.driverId,
        tripId: t.id,
        date: iso(-12 + i),
        litres,
        rate,
        amount: litres * rate,
        odometer: Number(t.startOdometer) + 120,
        station: pick(["Meghna Filling Station", "Padma Oil Pump", "Jamuna Fuel Center", "Trust Filling Station", "Rupsha Petrol Pump"], i),
        method: pick(["Cash", "bKash", "Bank Transfer"], i),
        status: pick(["Verified", "Verified", "Pending", "Verified", "Flagged"], i),
        notes: "",
      }, 12 - i),
    );
  }

  const maintenance: Rec[] = [];
  const mTypes = ["Oil Change", "Brake Service", "Engine Repair", "Tyre Replacement", "Preventive Service", "Electrical", "AC Service", "Inspection", "Body Work", "Oil Change", "Brake Service", "Preventive Service"];
  const mStatus = ["Completed", "In Progress", "Scheduled", "Completed", "Requested", "Completed", "Scheduled", "Completed", "Cancelled", "Scheduled", "Completed", "In Progress"];
  for (let i = 0; i < 12; i++) {
    const parts = 2500 + (i % 5) * 4200;
    const labour = 1200 + (i % 4) * 900;
    const status = mStatus[i]!;
    maintenance.push(
      make("maintenance", "MNT", {
        vehicleId: vehicles[(i * 5) % 12]!.id,
        serviceType: mTypes[i],
        kind: ["Engine Repair", "Electrical", "Body Work", "Brake Service"].includes(mTypes[i]!) ? "Repair" : "Preventive",
        description: `${mTypes[i]} as per service schedule / driver report.`,
        priority: pick(["Medium", "High", "Low", "Urgent"], i),
        scheduledDate: iso(i - 6),
        completedDate: status === "Completed" ? iso(i - 5) : undefined,
        workshop: pick(["Rangs Workshop", "Navana Service Center", "Tejgaon Auto Works", "Pacific Motors", "Uttara Diesel Works"], i),
        partsCost: parts,
        labourCost: labour,
        cost: parts + labour,
        odometer: Number(vehicles[(i * 5) % 12]!.odometer) - 300,
        nextServiceKm: Number(vehicles[(i * 5) % 12]!.odometer) + 5000,
        status,
      }, 10 - i),
    );
  }

  const expenses: Rec[] = [];
  const expDescs = ["Toll — Meghna Bridge", "Driver food allowance", "Loading labour charge", "Terminal parking fee", "Brake pad replacement", "Police checkpost fee", "Tyre puncture repair", "Driver night allowance", "Unloading labour", "Toll — Padma Bridge", "Weighbridge fee", "Office electricity bill", "Spare filter purchase", "Ferry charge"];
  for (let i = 0; i < 14; i++) {
    const t = trips[i % trips.length]!;
    expenses.push(
      make("expenses", "EXP", {
        categoryId: cats[[1, 2, 4, 5, 3, 8, 3, 2, 4, 1, 11, 7, 3, 1][i]!]!.id,
        description: expDescs[i],
        vehicleId: t.vehicleId,
        tripId: i === 11 ? undefined : t.id,
        date: iso(-11 + i),
        amount: [1200, 800, 2500, 600, 6800, 500, 1500, 900, 2200, 2400, 300, 4800, 3200, 1100][i],
        method: pick(["Cash", "bKash", "Cash", "Bank Transfer"], i),
        submittedBy: String(drivers[i % 12]!.name),
        status: pick(["Approved", "Paid", "Submitted", "Approved", "Rejected", "Paid", "Submitted"], i),
        notes: "",
      }, 11 - i),
    );
  }

  const invoices: Rec[] = [];
  const iStatus = ["Paid", "Partially Paid", "Sent", "Overdue", "Paid", "Approved", "Draft", "Sent", "Paid", "Overdue", "Partially Paid", "Paid"];
  const completedTrips = trips.filter((t) => t.status !== "Cancelled");
  for (let i = 0; i < 12; i++) {
    const t = completedTrips[i % completedTrips.length]!;
    const freight = Number(t.fare);
    const extra = 1800 + (i % 3) * 600;
    const vat = 5;
    const total = Math.round((freight + extra) * (1 + vat / 100));
    const status = iStatus[i]!;
    invoices.push(
      make("invoices", "INV", {
        customerId: t.customerId,
        tripId: t.id,
        issueDate: iso(-40 + i * 3),
        dueDate: iso(-10 + i * 3),
        freight,
        extraCharges: extra,
        discount: 0,
        vatPct: vat,
        total,
        paid: status === "Paid" ? total : status === "Partially Paid" ? Math.round(total / 2) : 0,
        status,
        notes: "Payment by bank transfer or bKash merchant.",
      }, 40 - i * 3),
    );
  }

  const payments: Rec[] = [];
  invoices
    .filter((v) => Number(v.paid) > 0)
    .forEach((v, i) =>
      payments.push(
        make("payments", "PAY", {
          customerId: v.customerId,
          invoiceId: v.id,
          date: iso(-30 + i * 4),
          amount: v.paid,
          method: pick(["Bank Transfer", "bKash", "Cheque", "Bangla QR"], i),
          reference: `TRX${880120 + i * 377}`,
          status: "Cleared",
          notes: "",
        }, 30 - i * 4),
      ),
    );
  // Advance / on-account receipts so the list has a full page.
  for (let i = 0; payments.length < 12; i++) {
    payments.push(make("payments", "PAY", { customerId: customers[(i + 3) % 12]!.id, date: iso(-6 + i), amount: 15000 + i * 2500, method: pick(["bKash", "Cash", "Nagad"], i), reference: `ADV-${4400 + i}`, status: pick(["Pending", "Cleared"], i), notes: "Advance against booking" }, 6 - i));
  }

  const incomes: Rec[] = [];
  for (let i = 0; i < 12; i++) {
    const t = completedTrips[i % completedTrips.length]!;
    incomes.push(
      make("incomes", "INC", {
        source: i % 5 === 4 ? "Detention Charge" : i % 7 === 6 ? "Rental" : "Trip Fare",
        customerId: t.customerId,
        tripId: t.id,
        date: iso(-24 + i * 2),
        amount: i % 5 === 4 ? 3000 : Number(t.fare),
        method: pick(["Bank Transfer", "bKash", "Cash", "Cheque"], i),
        reference: `RCV-${7001 + i}`,
        status: i % 6 === 5 ? "Pending" : "Received",
        notes: "",
      }, 24 - i * 2),
    );
  }

  const challans: Rec[] = [];
  for (let i = 0; i < 12; i++) {
    const t = trips[i]!;
    challans.push(make("challans", "CHL", { tripId: t.id, customerId: t.customerId, date: t.startDate, goods: t.goods, packages: 120 + i * 35, receiver: `${contacts[i]} (store)`, status: t.status === "Completed" ? "Delivered" : t.status === "Cancelled" ? "Returned" : "Issued" }, 9 - i));
  }

  const settlements: Rec[] = [];
  trips
    .filter((t) => t.status === "Completed")
    .forEach((t, i) => {
      const actual = Number(t.advance) - 1500 + i * 900;
      settlements.push(make("settlements", "STL", { tripId: t.id, driverId: t.driverId, advance: t.advance, actualExpense: actual, balance: Number(t.advance) - actual, date: t.endDate ?? t.startDate, status: pick(["Settled", "Approved", "Pending", "Settled"], i), notes: "" }, 5 - i));
    });
  for (let i = 0; settlements.length < 10; i++) {
    const t = trips[i]!;
    settlements.push(make("settlements", "STL", { tripId: t.id, driverId: t.driverId, advance: t.advance, actualExpense: Number(t.advance) + 1200, balance: -1200, date: iso(0), status: "Pending", notes: "Expense exceeded advance — driver to be reimbursed" }, 1));
  }

  const driverPayments: Rec[] = [];
  const months = (back: number) => new Date(Date.now() - back * 30 * DAY).toLocaleString("en-GB", { month: "long", year: "numeric" });
  for (let i = 0; i < 14; i++) {
    const d = drivers[i % 12]!;
    driverPayments.push(make("driverPayments", "DPY", { driverId: d.id, type: i < 12 ? "Salary" : "Trip Bonus", month: months(i < 12 ? 1 : 0), amount: i < 12 ? d.salary : 3000, method: pick(["Bank Transfer", "bKash", "Cash"], i), date: iso(-25 + i), status: i % 5 === 4 ? "Pending" : "Paid", notes: "" }, 25 - i));
  }

  const driverAdvances: Rec[] = [];
  trips.slice(0, 12).forEach((t, i) => driverAdvances.push(make("driverAdvances", "ADV", { driverId: t.driverId, tripId: t.id, date: t.startDate, amount: t.advance, settled: t.status === "Completed" ? t.advance : i % 3 === 0 ? 4000 : 0, purpose: "Trip running expenses (fuel top-up, toll, food)", status: t.status === "Completed" ? "Settled" : i % 3 === 0 ? "Partially Settled" : "Outstanding" }, 9 - i)));

  const supplierBills: Rec[] = [];
  const suppliers = ["Meghna Filling Station", "Rangs Workshop", "Navana Spare Parts", "Bridgestone Tyres BD", "Green Delta Insurance", "Padma Oil Pump", "Tejgaon Auto Works", "Pacific Motors", "Jamuna Fuel Center", "Uttara Diesel Works", "Trust Filling Station", "Karnaphuli Insurance"];
  suppliers.forEach((s, i) => {
    const amount = 18000 + i * 6200;
    const status = pick(["Paid", "Unpaid", "Partially Paid", "Overdue", "Unpaid", "Paid"], i);
    supplierBills.push(make("supplierBills", "SBL", { supplier: s, category: /Filling|Oil|Fuel/.test(s) ? "Fuel Station" : /Insurance/.test(s) ? "Insurance" : /Tyre/.test(s) ? "Tyres" : /Spare/.test(s) ? "Spare Parts" : "Workshop", billNo: `B-${5100 + i * 13}`, billDate: iso(-35 + i * 2), dueDate: iso(-5 + i * 2), amount, paid: status === "Paid" ? amount : status === "Partially Paid" ? Math.round(amount / 2) : 0, status, notes: "" }, 35 - i * 2));
  });

  const documents: Rec[] = [];
  const docDefs: [string, string, number][] = [
    ["Registration", "BRTA Registration Certificate", 900],
    ["Fitness", "Fitness Certificate", 20],
    ["Insurance", "Comprehensive Insurance Policy", 140],
    ["Tax Token", "Tax Token 2026–27", -8],
    ["Route Permit", "Inter-district Route Permit", 300],
  ];
  vehicles.slice(0, 8).forEach((v, vi) =>
    docDefs.forEach(([type, name, exp], di) => {
      if ((vi + di) % 3 === 2 && di > 1) return;
      const expiry = iso(exp + vi * 9 - (di === 1 && vi % 2 ? 40 : 0));
      documents.push(make("documents", "DOC", { name: `${name} — ${v.regNo}`, docType: type, ownerType: "Vehicle", vehicleId: v.id, number: `${type.slice(0, 3).toUpperCase()}-${48000 + vi * 97 + di}`, issueDate: iso(exp - 365), expiryDate: expiry, responsible: "Fleet Manager", fileName: `${type.toLowerCase().replace(/\s+/g, "-")}-${String(v.regNo).toLowerCase()}.pdf`, fileSize: `${(0.6 + ((vi + di) % 5) * 0.4).toFixed(1)} MB`, status: docStatus(expiry), notes: "" }, 60 + vi));
    }),
  );
  drivers.forEach((d) => documents.push(make("documents", "DOC", { name: `Driving Licence — ${d.name}`, docType: "Driving Licence", ownerType: "Driver", driverId: d.id, number: d.licenseNo, issueDate: iso(-1500), expiryDate: d.licenseExpiry, responsible: "HR / Operations", fileName: `licence-${String(d.name).toLowerCase().replace(/\s+/g, "-")}.pdf`, fileSize: "0.8 MB", status: docStatus(d.licenseExpiry), notes: "" }, 50)));
  [["Carriage Agreement — Apex Textiles", "Contract", "Customer"], ["Bank Statement — September", "Bank Statement", "Finance"], ["VAT Return — Q3", "Invoice", "Finance"], ["Trade Licence 2026–27", "Other", "Company"]].forEach(([name, type, owner], i) =>
    documents.push(make("documents", "DOC", { name, docType: type, ownerType: owner, number: `CO-${700 + i}`, issueDate: iso(-90), expiryDate: type === "Bank Statement" || type === "Invoice" ? undefined : iso(200 + i * 40), responsible: "Accounts", fileName: `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, fileSize: `${1 + i * 0.5} MB`, status: docStatus(type === "Bank Statement" || type === "Invoice" ? undefined : iso(200 + i * 40)), notes: "" }, 30)),
  );

  const staff: Rec[] = [];
  const staffDefs: [string, string, string][] = [
    ["Rakib Hasan", "Helper", "Operations"],
    ["Sumon Mia", "Helper", "Operations"],
    ["Liton Das", "Dispatcher", "Operations"],
    ["Hafizur Rahman", "Mechanic", "Maintenance"],
    ["Babul Sheikh", "Mechanic", "Maintenance"],
    ["Jewel Ahmed", "Storekeeper", "Maintenance"],
    ["Rumana Akter", "Accountant", "Finance"],
    ["Selim Reza", "Supervisor", "Operations"],
    ["Abdul Malek", "Security", "Administration"],
    ["Moni Begum", "Accountant", "Finance"],
    ["Kawsar Ali", "Dispatcher", "Operations"],
    ["Ripon Mondal", "Helper", "Operations"],
  ];
  staffDefs.forEach(([name, role, dep], i) => staff.push(make("staff", "STF", { name, role, department: dep, phone: `+880 19${10 + i} ${500 + i * 17} ${600 + i * 3}`, salary: 14000 + (i % 5) * 3000, joinDate: iso(-800 + i * 40), branch: pick(branches, i), status: i === 8 ? "On Leave" : "Active" }, 800 - i * 40)));

  const geofences: Rec[] = [];
  [["Tejgaon Central Depot", "Depot", "Tejgaon I/A, Dhaka", 400], ["Chattogram Port Gate 4", "Port", "CPA, Chattogram", 600], ["Apex Textiles Factory", "Customer site", "Gazipur", 300], ["Mongla Port", "Port", "Mongla, Bagerhat", 800], ["Meghna Filling Station", "Fuel station", "Meghna Bridge", 150], ["Dhaka City No-truck Zone", "Restricted", "Gulshan–Banani", 2500], ["Bogura Northern Hub", "Depot", "Bogura", 400], ["Square Pharma Plant", "Customer site", "Pabna", 350], ["Benapole Land Port", "Port", "Jashore", 700], ["Sylhet East Hub", "Depot", "Sylhet", 350]].forEach(([name, type, loc, r], i) =>
    geofences.push(make("geofences", "GEO", { name, type, location: loc, radiusM: r, alertOn: pick(["Entry & exit", "Entry", "Exit"], i), status: i === 9 ? "Inactive" : "Active" }, 200 - i)),
  );

  const roles: Rec[] = [];
  [["Super Admin", "System setup, users, roles, permissions and master configuration"], ["Fleet Manager", "Vehicles, availability, assignment and fleet performance"], ["Operations Manager", "Orders, trip planning, dispatch, delivery and exceptions"], ["Dispatcher", "Daily trips, vehicle/driver assignment and dispatch status"], ["Driver", "Assigned trips, status, odometer, fuel/expense and POD"], ["Maintenance Manager", "Service schedule, repair requests and work orders"], ["Storekeeper", "Spare parts, stock movement and reorder"], ["Finance / Accountant", "Fuel/expense verification, settlement, billing and accounts"], ["Customer Service", "Customers, orders/consignments and delivery status"], ["Management Viewer", "Dashboards, KPIs and approved reports"], ["Auditor", "Read-only history, approvals and audit log"]].forEach(([name, description]) => roles.push(make("roles", "ROL", { name, description, status: "Active" }, 400)));

  const users: Rec[] = [];
  [["Admin User", "admin@tranzora.com", 0], ["Faisal Ahmed", "fleet@tranzora.com", 1], ["Nusrat Jahan", "ops@tranzora.com", 2], ["Liton Das", "dispatch@tranzora.com", 3], ["Arif Hossain", "arif.driver@tranzora.com", 4], ["Hafizur Rahman", "workshop@tranzora.com", 5], ["Jewel Ahmed", "store@tranzora.com", 6], ["Rumana Akter", "accounts@tranzora.com", 7], ["Sabina Akter", "cs@tranzora.com", 8], ["Mahbub Alam", "md@tranzora.com", 9], ["Tahmina Begum", "audit@tranzora.com", 10], ["Kawsar Ali", "dispatch2@tranzora.com", 3]].forEach(([name, email, ri], i) =>
    users.push(make("users", "USR", { name, email, phone: `+880 17${55 + i} ${100 + i * 21} ${700 + i}`, roleId: roles[ri as number]!.id, branch: i === 0 ? "All branches" : pick(branches, i), password: i === 0 ? "tranzora123" : "demo1234", lastLogin: stamp(-(i % 6), 9 + i % 8), status: i === 11 ? "Inactive" : "Active" }, 300 - i * 10)),
  );

  const subscriptionPayments: Rec[] = [];
  for (let i = 0; i < 10; i++) subscriptionPayments.push(make("subscriptionPayments", "SUB", { plan: i < 6 ? "Business" : "Enterprise", period: months(9 - i), date: iso(-270 + i * 30), amount: i < 6 ? 4999 : 9999, method: pick(["Bangla QR", "bKash", "Bank Transfer"], i), status: "Paid" }, 270 - i * 30));

  const paymentMethods: Rec[] = [
    ["Cash", "Cash", "Main cash box — Tejgaon"],
    ["Dutch-Bangla Bank", "Bank", "A/C 114-120-49281"],
    ["bKash Merchant", "Mobile Banking", "01712 345 678"],
    ["Nagad Merchant", "Mobile Banking", "01811 223 344"],
    ["Bangla QR", "QR", "Merchant ID 900184"],
    ["Cheque", "Cheque", "Accounts payable"],
  ].map(([name, type, account], i) => make("paymentMethods", "PMT", { name, type, account, status: i === 5 ? "Disabled" : "Enabled" }, 500));

  const notifications: Rec[] = [];
  const nDefs: [string, string, string, string, string?, string?][] = [
    ["Trip TRP-0001 is in progress", `${trips[0]!.code} departed ${trips[0]!.pickup}`, "Trip", "Info", "trips", trips[0]!.id],
    ["Fitness certificate expiring soon", `${vehicles[1]!.regNo} fitness expires within 30 days`, "Compliance", "Warning", "vehicles", vehicles[1]!.id],
    ["Driving licence expired", `${drivers[5]!.name}'s licence has expired`, "Compliance", "Critical", "drivers", drivers[5]!.id],
    ["Invoice overdue", `${invoices[3]!.code} is past its due date`, "Payment", "Critical", "invoices", invoices[3]!.id],
    ["Payment received", `৳ ${Number(payments[0]!.amount).toLocaleString("en-IN")} cleared for ${invoices[0]!.code}`, "Payment", "Success", "payments", payments[0]!.id],
    ["Maintenance due", `${maintenance[2]!.code} scheduled for ${maintenance[2]!.scheduledDate}`, "Maintenance", "Warning", "maintenance", maintenance[2]!.id],
    ["Fuel entry flagged", `${fuel[4]!.code}: unusual consumption — review required`, "Trip", "Warning", "fuel", fuel[4]!.id],
    ["Expense awaiting approval", `${expenses[2]!.code} — ${expenses[2]!.description}`, "Approval", "Info", "expenses", expenses[2]!.id],
    ["New booking received", `${bookings[5]!.code} from ${customers[5]!.name}`, "Trip", "Info", "bookings", bookings[5]!.id],
    ["Trip completed", `${trips[2]!.code} delivered — POD pending verification`, "Trip", "Success", "trips", trips[2]!.id],
    ["Tax token expired", `${vehicles[0]!.regNo} tax token renewal overdue`, "Compliance", "Critical", "vehicles", vehicles[0]!.id],
    ["Settlement pending", "Driver settlement awaiting finance verification", "Approval", "Info", "settlements", settlements[2]?.id],
  ];
  nDefs.forEach(([title, body, category, severity, entity, recordId], i) => notifications.push(make("notifications", "NTF", { title, body, category, severity, entity, recordId, read: i > 7 }, i * 0.2)));

  const auditLogs: Rec[] = [];
  const logDefs: [string, string, string, string, string][] = [
    ["Login", "Authentication", "Admin User signed in", "Admin User", "Info"],
    ["Create", "Trips", `Trip ${trips[0]!.code} created`, "Liton Das", "Info"],
    ["Status change", "Trips", `${trips[0]!.code}: Approved → Dispatched`, "Nusrat Jahan", "Info"],
    ["Create", "Fuel", `${fuel[0]!.code} recorded`, "Arif Hossain", "Info"],
    ["Approve", "Expenses", `${expenses[0]!.code} approved`, "Rumana Akter", "Info"],
    ["Update", "Vehicles", `${vehicles[3]!.regNo} sent to maintenance`, "Faisal Ahmed", "Warning"],
    ["Delete", "Bookings", "Duplicate booking removed", "Sabina Akter", "Warning"],
    ["Failed login", "Authentication", "3 failed attempts for dispatch2@tranzora.com", "System", "Critical"],
    ["Create", "Invoices", `${invoices[0]!.code} issued`, "Rumana Akter", "Info"],
    ["Payment", "Payments", `${payments[0]!.code} cleared`, "Rumana Akter", "Info"],
    ["Update", "Settings", "Notification settings changed", "Admin User", "Info"],
    ["Export", "Reports", "Trip report exported", "Mahbub Alam", "Info"],
  ];
  logDefs.forEach(([action, module, message, user, level], i) => auditLogs.push(make("auditLogs", "LOG", { action, module, message, user, level, recordRef: "", ip: `192.168.1.${20 + i}` }, i * 0.4)));

  const reports: Rec[] = [];
  [["Trip Report", "Operations"], ["Income Report", "Finance"], ["Fuel Report", "Fuel & Cost"], ["Vehicle Report", "Fleet"], ["Maintenance Report", "Fuel & Cost"]].forEach(([name, type], i) => reports.push(make("reports", "RPT", { name, type, rows: 12 + i, generatedBy: "Admin User", status: "Ready", reportKey: String(name).toLowerCase().replace(/\s+/g, "-") }, i + 1)));

  // Six months of completed, billed and paid trips so trends and reports have history.
  for (let k = 0; k < 42; k++) {
    const back = 14 + Math.round(k * 4.1);
    const r = routes[(k * 5) % 11]!;
    const ci = (k * 7) % 11;
    const vi = (k * 3) % 12;
    const fare = Number(r.distanceKm) * 210 + 6000 + (k % 5) * 1500;
    const t = make("trips", "TRP", {
      customerId: customers[ci]!.id,
      routeId: r.id,
      pickup: `${r.origin} — ${customers[ci]!.name} warehouse`,
      dropoff: String(r.destination),
      vehicleId: vehicles[vi]!.id,
      driverId: drivers[vi]!.id,
      helper: pick(["Rakib", "Sumon", "Babul", "Jewel", "Liton"], k),
      goods: goods[ci],
      weight: `${(5 + (k % 6) * 1.5).toFixed(1)} ton`,
      startDate: iso(-back),
      endDate: iso(-back + 1),
      distanceKm: r.distanceKm,
      startOdometer: 30000 + k * 610,
      fare,
      advance: 8000,
      status: "Completed",
      notes: "",
    }, back);
    trips.push(t);
    const litres = Math.round(Number(r.distanceKm) / 3.1);
    fuel.push(make("fuel", "FUL", { vehicleId: t.vehicleId, driverId: t.driverId, tripId: t.id, date: t.startDate, litres, rate: 109, amount: litres * 109, odometer: Number(t.startOdometer) + 40, station: pick(["Meghna Filling Station", "Padma Oil Pump", "Jamuna Fuel Center", "Trust Filling Station"], k), method: pick(["Cash", "bKash"], k), status: "Verified", notes: "" }, back));
    expenses.push(make("expenses", "EXP", { categoryId: cats[pick([1, 2, 4], k)]!.id, description: pick(["Toll — Meghna Bridge", "Driver food allowance", "Loading labour charge", "Toll — Padma Bridge"], k), vehicleId: t.vehicleId, tripId: t.id, date: t.startDate, amount: 1200 + (k % 4) * 700, method: "Cash", submittedBy: String(drivers[vi]!.name), status: "Paid", notes: "" }, back));
    incomes.push(make("incomes", "INC", { source: "Trip Fare", customerId: t.customerId, tripId: t.id, date: iso(-back + 3), amount: fare, method: pick(["Bank Transfer", "bKash", "Cheque"], k), reference: `RCV-${8100 + k}`, status: "Received", notes: "" }, back - 3));
    const total = Math.round((fare + 1800) * 1.05);
    const inv = make("invoices", "INV", { customerId: t.customerId, tripId: t.id, issueDate: iso(-back + 1), dueDate: iso(-back + 31), freight: fare, extraCharges: 1800, discount: 0, vatPct: 5, total, paid: total, status: "Paid", notes: "Payment by bank transfer or bKash merchant." }, back - 1);
    invoices.push(inv);
    payments.push(make("payments", "PAY", { customerId: t.customerId, invoiceId: inv.id, date: iso(-back + 3), amount: total, method: pick(["Bank Transfer", "bKash", "Cheque", "Bangla QR"], k), reference: `TRX${900400 + k * 211}`, status: "Cleared", notes: "" }, back - 3));
  }
  for (let m = 2; m <= 5; m++)
    drivers.forEach((d, i) => driverPayments.push(make("driverPayments", "DPY", { driverId: d.id, type: "Salary", month: months(m), amount: d.salary, method: pick(["Bank Transfer", "bKash", "Cash"], i), date: iso(-m * 30 + 3), status: "Paid", notes: "" }, m * 30)));
  const byNewest = (a: Rec, b: Rec) => String(b.createdAt).localeCompare(String(a.createdAt));
  [trips, fuel, expenses, incomes, invoices, payments, driverPayments].forEach((l) => l.sort(byNewest));

  return {
    seq,
    collections: {
      vehicles,
      drivers,
      staff,
      driverPayments,
      trips,
      settlements,
      bookings,
      customers,
      routes,
      geofences,
      fuel,
      maintenance,
      incomes,
      expenses,
      expenseCategories: cats,
      invoices,
      challans,
      payments,
      supplierBills,
      driverAdvances,
      documents,
      reports,
      subscriptionPayments,
      users,
      roles,
      auditLogs,
      notifications,
      paymentMethods,
    },
  };
}
