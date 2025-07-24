const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { connect } = require("./mongo");
let currentEditId = null; // מזהה מסלול בעדכון

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// שמירת התחברות (ניתן לבטל בעתיד)
const activeSessions = new Map();

// דף הבית
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// התחברות
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const usersCollection = await connect("users");
    const user = await usersCollection.findOne({ username, password });

    if (!user)
      return res.status(401).json({ message: "שם משתמש או סיסמה לא נכונים" });
    if (!user.approved)
      return res.status(403).json({ message: "המשתמש לא אושר עדיין" });

    // מניעת התחברות כפולה (לא חובה)
    // if (activeSessions.has(username)) {
    //   return res.status(409).json({ message: "המשתמש כבר מחובר ממכשיר אחר" });
    // }

    activeSessions.set(username, true);
    res.json({ message: "התחברת בהצלחה", role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאת שרת" });
  }
});

// הרשמה
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, firstname, lastname, email, phone } = req.body;
    if (!username || !password || !firstname || !lastname || !email || !phone)
      return res.status(400).json({ message: "יש למלא את כל השדות" });

    const usersCollection = await connect("users");
    const exists = await usersCollection.findOne({ username });
    if (exists) return res.status(409).json({ message: "שם המשתמש כבר קיים" });

    await usersCollection.insertOne({
      username,
      password,
      firstname,
      lastname,
      email,
      phone,
      role: "user",
      approved: false,
    });

    res.json({ message: "נרשמת בהצלחה! נא להמתין לאישור מנהל" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאת שרת" });
  }
});

// הוספת מסלול חדש
app.post("/api/admin/add-route", async (req, res) => {
  try {
    const { origin, destination, km, waitTime, vehicles } = req.body;
    const route = `${origin} - ${destination}`;

    const collection = await connect(); // ברירת מחדל: collection בשם "routes"
    await collection.insertOne({ route, km, waitTime, vehicles });

    res.json({ message: "המסלול נוסף בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "שגיאה בשמירה" });
  }
});

// שליפת מסלולים
app.get("/api/prices", async (req, res) => {
  try {
    const collection = await connect(); // "routes"
    const data = await collection.find({}).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "שגיאה בשליפה" });
  }
});

// בדיקת חיבור למונגו
app.get("/test-mongo", async (req, res) => {
  try {
    const collection = await connect(); // "routes"
    const count = await collection.countDocuments();
    res.send(`✅ חיבור תקין! יש ${count} מסלולים במאגר.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ החיבור נכשל. בדוק את הקישור ל־MongoDB");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
