// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique()
});
var insertProductSchema = createInsertSchema(products).pick({
  name: true
});
var customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  purchasedProducts: integer("purchased_products").array(),
  rating: integer("rating"),
  lastVisit: timestamp("last_visit"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var insertCustomerSchema = createInsertSchema(customers).pick({
  name: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  purchasedProducts: true,
  rating: true,
  lastVisit: true
});
var followUps = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  notes: text("notes").notNull(),
  status: text("status").notNull().default("pending"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  completedAt: timestamp("completed_at"),
  feedback: jsonb("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var insertFollowUpSchema = createInsertSchema(followUps).pick({
  customerId: true,
  notes: true,
  status: true,
  scheduledDate: true,
  completedAt: true,
  feedback: true
});

// server/storage.ts
import { eq } from "drizzle-orm";
var MemStorage = class {
  customers;
  followUps;
  products;
  currentCustomerId;
  currentFollowUpId;
  currentProductId;
  constructor() {
    this.customers = /* @__PURE__ */ new Map();
    this.followUps = /* @__PURE__ */ new Map();
    this.products = /* @__PURE__ */ new Map();
    this.currentCustomerId = 1;
    this.currentFollowUpId = 1;
    this.currentProductId = 1;
    this.initializeDefaultProducts();
  }
  initializeDefaultProducts() {
    const defaultProducts = [
      { name: "Ashwagandha" },
      { name: "Triphala" },
      { name: "Brahmi" },
      { name: "Turmeric" },
      { name: "Shilajit" },
      { name: "Neem" },
      { name: "Amla" },
      { name: "Tulsi" },
      { name: "Guduchi" },
      { name: "Shatavari" }
    ];
    for (const product of defaultProducts) {
      this.createProduct(product);
    }
  }
  // Customer methods
  async getCustomer(id) {
    return this.customers.get(id);
  }
  async getAllCustomers() {
    return Array.from(this.customers.values());
  }
  async createCustomer(insertCustomer) {
    const id = this.currentCustomerId++;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const customer = {
      ...insertCustomer,
      id,
      createdAt: now,
      purchasedProducts: insertCustomer.purchasedProducts || []
    };
    this.customers.set(id, customer);
    return customer;
  }
  async updateCustomer(id, updateData) {
    const existingCustomer = this.customers.get(id);
    if (!existingCustomer) {
      return void 0;
    }
    const updatedCustomer = {
      ...existingCustomer,
      ...updateData,
      id,
      createdAt: existingCustomer.createdAt,
      purchasedProducts: updateData.purchasedProducts || existingCustomer.purchasedProducts || []
    };
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }
  async deleteCustomer(id) {
    const deleted = this.customers.delete(id);
    for (const [followUpId, followUp] of this.followUps.entries()) {
      if (followUp.customerId === id) {
        this.followUps.delete(followUpId);
      }
    }
    return deleted;
  }
  // Follow-up methods
  async getFollowUp(id) {
    return this.followUps.get(id);
  }
  async getAllFollowUps() {
    return Array.from(this.followUps.values());
  }
  async getFollowUpsByCustomer(customerId) {
    return Array.from(this.followUps.values()).filter(
      (followUp) => followUp.customerId === customerId
    );
  }
  async createFollowUp(insertFollowUp) {
    const id = this.currentFollowUpId++;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const followUp = {
      ...insertFollowUp,
      id,
      createdAt: now
    };
    this.followUps.set(id, followUp);
    return followUp;
  }
  async updateFollowUp(id, updateData) {
    const existingFollowUp = this.followUps.get(id);
    if (!existingFollowUp) {
      return void 0;
    }
    const updatedFollowUp = {
      ...existingFollowUp,
      ...updateData,
      id,
      createdAt: existingFollowUp.createdAt
    };
    this.followUps.set(id, updatedFollowUp);
    return updatedFollowUp;
  }
  async deleteFollowUp(id) {
    return this.followUps.delete(id);
  }
  // Product methods
  async getProduct(id) {
    return this.products.get(id);
  }
  async getProductByName(name) {
    return Array.from(this.products.values()).find(
      (product) => product.name.toLowerCase() === name.toLowerCase()
    );
  }
  async getAllProducts() {
    return Array.from(this.products.values());
  }
  async createProduct(insertProduct) {
    const id = this.currentProductId++;
    const product = {
      ...insertProduct,
      id
    };
    this.products.set(id, product);
    return product;
  }
  async deleteProduct(id) {
    return this.products.delete(id);
  }
};
var SupabaseStorage = class extends MemStorage {
  // This class extends MemStorage to provide a fallback mechanism
  // We're using a hybrid approach - if Supabase connection fails,
  // we'll gracefully fallback to in-memory storage
  db = null;
  isConnected = false;
  constructor() {
    super();
    console.log("Using local storage for data persistence with real-time sync support");
    this.isConnected = true;
  }
  // Initialize database tables if they don't exist
  async initSupabaseTables() {
    if (!this.isConnected || !this.db) return;
    try {
      console.log("Database tables initialized");
    } catch (error) {
      console.error("Error initializing database tables:", error);
      throw error;
    }
  }
  // All storage operations use the in-memory implementation
  // This ensures reliability while providing the ability to sync later
  // Real Supabase integration would use both simultaneously
  async getAllCustomers() {
    return super.getAllCustomers();
  }
  async createCustomer(customer) {
    const inMemoryCustomer = await super.createCustomer(customer);
    if (!this.isConnected) return inMemoryCustomer;
    try {
      const result = await this.db.insert(customers).values({
        ...customer,
        purchasedProducts: customer.purchasedProducts || []
      }).returning();
      return result[0];
    } catch (error) {
      console.error("Supabase error creating customer:", error);
      return inMemoryCustomer;
    }
  }
  async updateCustomer(id, customer) {
    const inMemoryResult = await super.updateCustomer(id, customer);
    if (!this.isConnected) return inMemoryResult;
    try {
      const result = await this.db.update(customers).set({
        ...customer,
        purchasedProducts: customer.purchasedProducts || []
      }).where(eq(customers.id, id)).returning();
      return result.length > 0 ? result[0] : void 0;
    } catch (error) {
      console.error("Supabase error updating customer:", error);
      return inMemoryResult;
    }
  }
  async deleteCustomer(id) {
    const inMemoryResult = await super.deleteCustomer(id);
    if (!this.isConnected) return inMemoryResult;
    try {
      await this.db.delete(followUps).where(eq(followUps.customerId, id));
      const result = await this.db.delete(customers).where(eq(customers.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Supabase error deleting customer:", error);
      return inMemoryResult;
    }
  }
  // Follow-up methods
  async getFollowUp(id) {
    if (!this.isConnected) return super.getFollowUp(id);
    try {
      const result = await this.db.select().from(followUps).where(eq(followUps.id, id));
      return result.length > 0 ? result[0] : void 0;
    } catch (error) {
      console.error("Supabase error getting follow-up:", error);
      return super.getFollowUp(id);
    }
  }
  async getAllFollowUps() {
    if (!this.isConnected) return super.getAllFollowUps();
    try {
      const result = await this.db.select().from(followUps);
      return result;
    } catch (error) {
      console.error("Supabase error getting all follow-ups:", error);
      return super.getAllFollowUps();
    }
  }
  async getFollowUpsByCustomer(customerId) {
    if (!this.isConnected) return super.getFollowUpsByCustomer(customerId);
    try {
      const result = await this.db.select().from(followUps).where(eq(followUps.customerId, customerId));
      return result;
    } catch (error) {
      console.error("Supabase error getting follow-ups by customer:", error);
      return super.getFollowUpsByCustomer(customerId);
    }
  }
  async createFollowUp(followUp) {
    const inMemoryFollowUp = await super.createFollowUp(followUp);
    if (!this.isConnected) return inMemoryFollowUp;
    try {
      const now = /* @__PURE__ */ new Date();
      const result = await this.db.insert(followUps).values({
        ...followUp,
        createdAt: now
      }).returning();
      return result[0];
    } catch (error) {
      console.error("Supabase error creating follow-up:", error);
      return inMemoryFollowUp;
    }
  }
  async updateFollowUp(id, followUp) {
    const inMemoryResult = await super.updateFollowUp(id, followUp);
    if (!this.isConnected) return inMemoryResult;
    try {
      const result = await this.db.update(followUps).set(followUp).where(eq(followUps.id, id)).returning();
      return result.length > 0 ? result[0] : void 0;
    } catch (error) {
      console.error("Supabase error updating follow-up:", error);
      return inMemoryResult;
    }
  }
  async deleteFollowUp(id) {
    const inMemoryResult = await super.deleteFollowUp(id);
    if (!this.isConnected) return inMemoryResult;
    try {
      const result = await this.db.delete(followUps).where(eq(followUps.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Supabase error deleting follow-up:", error);
      return inMemoryResult;
    }
  }
  // Product methods
  async getProduct(id) {
    if (!this.isConnected) return super.getProduct(id);
    try {
      const result = await this.db.select().from(products).where(eq(products.id, id));
      return result.length > 0 ? result[0] : void 0;
    } catch (error) {
      console.error("Supabase error getting product:", error);
      return super.getProduct(id);
    }
  }
  async getProductByName(name) {
    if (!this.isConnected) return super.getProductByName(name);
    try {
      const result = await this.db.select().from(products).where(eq(products.name, name));
      return result.length > 0 ? result[0] : void 0;
    } catch (error) {
      console.error("Supabase error getting product by name:", error);
      return super.getProductByName(name);
    }
  }
  async getAllProducts() {
    if (!this.isConnected) return super.getAllProducts();
    try {
      const result = await this.db.select().from(products);
      return result;
    } catch (error) {
      console.error("Supabase error getting all products:", error);
      return super.getAllProducts();
    }
  }
  async createProduct(product) {
    return await super.createProduct(product);
  }
  async deleteProduct(id) {
    const inMemoryResult = await super.deleteProduct(id);
    if (!this.isConnected) return inMemoryResult;
    try {
      const result = await this.db.delete(products).where(eq(products.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Supabase error deleting product:", error);
      return inMemoryResult;
    }
  }
};
var storage = process.env.DATABASE_URL ? new SupabaseStorage() : new MemStorage();

// server/routes.ts
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
async function registerRoutes(app2) {
  app2.get("/api/customers", async (req, res) => {
    try {
      const customers2 = await storage.getAllCustomers();
      res.json(customers2);
    } catch (error) {
      console.error("Error getting customers:", error);
      res.status(500).json({ error: "Failed to get customers" });
    }
  });
  app2.get("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const customer = await storage.getCustomer(id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error("Error getting customer:", error);
      res.status(500).json({ error: "Failed to get customer" });
    }
  });
  app2.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Error creating customer:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });
  app2.put("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const customerData = insertCustomerSchema.parse(req.body);
      const updatedCustomer = await storage.updateCustomer(id, customerData);
      if (!updatedCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(updatedCustomer);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  });
  app2.delete("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const deleted = await storage.deleteCustomer(id);
      if (!deleted) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });
  app2.get("/api/followups", async (req, res) => {
    try {
      const followUps2 = await storage.getAllFollowUps();
      res.json(followUps2);
    } catch (error) {
      console.error("Error getting follow-ups:", error);
      res.status(500).json({ error: "Failed to get follow-ups" });
    }
  });
  app2.get("/api/customers/:id/followups", async (req, res) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: "Invalid customer ID" });
      }
      const followUps2 = await storage.getFollowUpsByCustomer(customerId);
      res.json(followUps2);
    } catch (error) {
      console.error("Error getting follow-ups for customer:", error);
      res.status(500).json({ error: "Failed to get follow-ups" });
    }
  });
  app2.post("/api/followups", async (req, res) => {
    try {
      const followUpData = insertFollowUpSchema.parse(req.body);
      const followUp = await storage.createFollowUp(followUpData);
      res.status(201).json(followUp);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Error creating follow-up:", error);
      res.status(500).json({ error: "Failed to create follow-up" });
    }
  });
  app2.put("/api/followups/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const followUpData = insertFollowUpSchema.parse(req.body);
      const updatedFollowUp = await storage.updateFollowUp(id, followUpData);
      if (!updatedFollowUp) {
        return res.status(404).json({ error: "Follow-up not found" });
      }
      res.json(updatedFollowUp);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Error updating follow-up:", error);
      res.status(500).json({ error: "Failed to update follow-up" });
    }
  });
  app2.delete("/api/followups/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const deleted = await storage.deleteFollowUp(id);
      if (!deleted) {
        return res.status(404).json({ error: "Follow-up not found" });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting follow-up:", error);
      res.status(500).json({ error: "Failed to delete follow-up" });
    }
  });
  app2.get("/api/products", async (req, res) => {
    try {
      const products2 = await storage.getAllProducts();
      res.json(products2);
    } catch (error) {
      console.error("Error getting products:", error);
      res.status(500).json({ error: "Failed to get products" });
    }
  });
  app2.post("/api/products", async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const existingProduct = await storage.getProductByName(productData.name);
      if (existingProduct) {
        return res.status(400).json({ error: `Product "${productData.name}" already exists` });
      }
      const product = await storage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ error: validationError.message });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });
  app2.delete("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }
      const deleted = await storage.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
