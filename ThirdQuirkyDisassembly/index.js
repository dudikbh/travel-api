// גרסה מתוקנת: תומכת בכל הפרמטרים מהטופס כולל מחיר, זמן, תחנה וכו'
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { connect } = require("./mongo");
const { ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// דפי HTML
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/users", (req, res) => res.sendFile(path.join(__dirname, "public", "users.html")));
app.get("/prices.html", (req, res) => res.sendFile(path.join(__dirname, "public", "prices.html")));

// התחברות
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await connect("users");
    const user = await users.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }, 
      password 
    });
    if (!user) return res.status(401).json({ message: "שם משתמש או סיסמה שגויים" });
    if (user.role !== "admin" && !user.approved) return res.status(403).json({ message: "המשתמש לא אושר" });
    res.json({ message: "התחברת בהצלחה", role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ message: "שגיאה בשרת" });
  }
});

// הרשמה
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, firstName, lastName, email, phone, role } = req.body;
    if (!username || !password || !firstName || !lastName || !email || !phone || !role)
      return res.status(400).json({ message: "יש למלא את כל השדות" });

    const users = await connect("users");
    
    // בדיקת שם משתמש (ללא תלות ברישיות)
    const existsUser = await users.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existsUser) return res.status(409).json({ message: "שם המשתמש כבר קיים במערכת" });
    
    // בדיקת מייל קיים
    const existsEmail = await users.findOne({ email });
    if (existsEmail) return res.status(409).json({ message: "כתובת המייל כבר קיימת במערכת" });
    
    // בדיקת טלפון קיים
    const existsPhone = await users.findOne({ phone });
    if (existsPhone) return res.status(409).json({ message: "מספר הטלפון כבר קיים במערכת" });

    await users.insertOne({ username: username.toLowerCase(), password, firstName, lastName, email, phone, role, approved: false });
    res.json({ message: "נרשמת בהצלחה! נא להמתין לאישור מנהל" });
  } catch (err) {
    res.status(500).json({ message: "שגיאה ברישום" });
  }
});

// משתמשים
app.get("/api/users", async (req, res) => {
  try {
    const users = await connect("users");
    const list = await users.find().toArray();
    res.json(list);
  } catch {
    res.status(500).json({ message: "שגיאה" });
  }
});

app.put("/api/users/approve/:id", async (req, res) => {
  try {
    const users = await connect("users");
    await users.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { approved: true } });
    res.json({ message: "אושר" });
  } catch {
    res.status(500).json({ message: "שגיאה" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const users = await connect("users");
    await users.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "נמחק" });
  } catch {
    res.status(500).json({ message: "שגיאה" });
  }
});

// פונקציה לנרמול מסלול (מיון לפי אלפבית)
function normalizeRoute(origin, destination) {
  const cities = [origin.trim(), destination.trim()].sort();
  return `${cities[0]} - ${cities[1]}`;
}

// הוספת מסלול
app.post("/api/admin/add-route", async (req, res) => {
  try {
    const { origin, destination, km, waitTimeSides, vehicles, vehiclesSides, adminUsername } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json({ message: "יש להזין מוצא ויעד" });
    }

    const route = `${origin} - ${destination}`;
    const normalizedRoute = normalizeRoute(origin, destination);
    const collection = await connect("routes");

    // בדיקת קיום מסלול (לפי הנרמול)
    const existingRoute = await collection.findOne({ normalizedRoute });
    if (existingRoute) {
      return res.status(409).json({ 
        message: `המסלול כבר קיים במערכת (${existingRoute.route})` 
      });
    }

    await collection.insertOne({
      route,
      normalizedRoute,
      km,
      waitTimeSides,
      vehicles: {
        car4: vehicles?.car4 || null,
        car6: vehicles?.car6 || null,
        car6plus: vehicles?.car6plus || null
      },
      vehiclesSides: {
        car4: vehiclesSides?.car4 || null,
        car6: vehiclesSides?.car6 || null,
        car6plus: vehiclesSides?.car6plus || null
      },
      addedBy: adminUsername || "לא ידוע",
      addedDate: new Date()
    });

    res.json({ message: "המסלול נוסף בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה בהוספת המסלול" });
  }
});

// שליפת מסלולים (ללקוחות - ללא פרטי מנהל)
app.get("/api/prices", async (req, res) => {
  try {
    const collection = await connect(); // "routes"
    const data = await collection.find({}).project({ 
      addedBy: 0, 
      addedDate: 0, 
      lastModifiedBy: 0, 
      lastModifiedDate: 0,
      normalizedRoute: 0 
    }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "שגיאה בשליפה" });
  }
});

// שליפת מסלולים למנהלים (עם פרטי מנהל)
app.get("/api/admin/routes", async (req, res) => {
  try {
    const collection = await connect(); // "routes"
    const data = await collection.find({}).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "שגיאה בשליפה" });
  }
});

// שליפת כל המשתמשים (למנהל)
app.get("/api/users", async (req, res) => {
  try {
    const usersCollection = await connect("users");
    const users = await usersCollection.find({}).toArray();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאת שרת" });
  }
});

// אישור משתמש
app.put("/api/admin/users/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    const usersCollection = await connect("users");

    await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approved: true } }
    );

    res.json({ message: "המשתמש אושר בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה באישור המשתמש" });
  }
});

// מחיקת משתמש
app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    const usersCollection = await connect("users");

    await usersCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "המשתמש נמחק בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה במחיקת המשתמש" });
  }
});

// עדכון מסלול
app.put("/api/admin/routes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { origin, destination, km, waitTimeSides, vehicles, vehiclesSides, adminUsername } = req.body;
    const route = `${origin} - ${destination}`;
    const normalizedRoute = normalizeRoute(origin, destination);
    const { ObjectId } = require('mongodb');

    const collection = await connect();
    
    // בדיקת קיום מסלול אחר עם אותו נרמול (למעט המסלול הנוכחי)
    const existingRoute = await collection.findOne({ 
      normalizedRoute, 
      _id: { $ne: new ObjectId(id) } 
    });
    
    if (existingRoute) {
      return res.status(409).json({ 
        message: `המסלול כבר קיים במערכת (${existingRoute.route})` 
      });
    }

    await collection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          route, 
          normalizedRoute,
          km, 
          waitTimeSides, 
          vehicles: {
            car4: vehicles?.car4 || null,
            car6: vehicles?.car6 || null,
            car6plus: vehicles?.car6plus || null
          },
          vehiclesSides: {
            car4: vehiclesSides?.car4 || null,
            car6: vehiclesSides?.car6 || null,
            car6plus: vehiclesSides?.car6plus || null
          },
          lastModifiedBy: adminUsername || "לא ידוע",
          lastModifiedDate: new Date()
        } 
      }
    );

    res.json({ message: "המסלול עודכן בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה בעדכון המסלול" });
  }
});

// מחיקת מסלול
app.delete("/api/admin/routes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ObjectId } = require('mongodb');
    const collection = await connect();

    await collection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "המסלול נמחק בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה במחיקת המסלול" });
  }
});

app.listen(PORT, () => console.log("Server on port", PORT));