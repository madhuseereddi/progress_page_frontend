const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Server } = require('socket.io');
const http = require('http');

const cookieParser = require('cookie-parser');



const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://progress-fe.onrender.com'], // Adjust this to match your frontend's URL
    methods: ["GET", "POST"],
    credentials: true, // Allow credentials to be sent
  }
});

app.use(cors({
  origin: ['https://progress-fe.onrender.com'], // Adjust this to match your frontend's URL
  credentials: true // Allow credentials to be sent
}));

app.use(bodyParser.json());
app.use(cookieParser()); // Middleware to parse cookies

const dbPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Saimadhu@123', // Replace with your own password
  database: 'progresdb'
});

// Create todos, face_data, and otp tables if they don't exist
async function createTables() {
  let connection;
  try {
    connection = await dbPool.getConnection();

    const createTodoTableQuery =
      `CREATE TABLE IF NOT EXISTS todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    await connection.execute(createTodoTableQuery);

    const createFaceDataTableQuery =
      `CREATE TABLE IF NOT EXISTS face_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        day DATE NOT NULL,
        imgSrc LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    await connection.execute(createFaceDataTableQuery);

    const createOtpTableQuery =
      `CREATE TABLE IF NOT EXISTS otp (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )`;
    await connection.execute(createOtpTableQuery);

    console.log("Tables created or already exist.");
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    if (connection) connection.release();
  }
}

createTables();

// Generate a 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Email transport configuration using Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change to another email service (Outlook, Yahoo, etc.)
  auth: {
    user: 'seereddym@gmail.com', // Replace with your email
    pass: 'wdjn psjv ssba woxz',  // Replace with your email password or app-specific password
  },
});

// Endpoint to send OTP
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60000); // OTP valid for 10 minutes

  let connection;
  try {
    connection = await dbPool.getConnection();

    // Store OTP in the database
    const query = 'INSERT INTO otp (email, otp, expires_at) VALUES (?, ?, ?)';
    await connection.execute(query, [email, otp, expiresAt]);

    // Send OTP via email
    const mailOptions = {
      from: '"no-reply@quotidian.com" <noreply@yourdomain.com>',
      to: email,
      subject: 'Your OTP for Verification',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border-radius: 5px;">
          <p style="font-size: 16px;">Dear Valued User,</p>
          <p style="font-size: 16px;">
            For security purposes, your One-Time Password (OTP) for account verification is <br><br>
            <span style="color : white ; background-color: #0c6af7; padding: 5px ; margin-top: 10px; margin-bottom : 10px; border-radius: 3px; font-weight: bold; font-size: 20px; letter-spacing : 7px;">${otp}</span>
          </p>
          <p style="font-size: 16px;">
            This OTP is <strong style="color: #d9534f;">VALID FOR THE NEXT 5 MINUTES</strong> and should not be shared with anyone. 
            Please use it to complete your authentication process.
          </p>
          <p style="font-size: 16px;">
            If you did not request this verification, please ignore this email.
          </p>
          <p style="font-size: 16px; background-color: #f2ff9e; padding: 10px; border-radius: 5px;">
            Thank you for choosing our service.<br>
            <strong>Quotidian</strong> Support Team
          </p>
        </div>
      `
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ error: "Error sending OTP. Please try again." });
      } else {
        console.log('Email sent: ' + info.response);
        io.emit('otpSent', { email }); // Emit event to notify frontend
        res.status(200).json({ message: "OTP sent successfully to your email!" });
      }
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to verify OTP
app.post('/verify-otp', async (req, res) => {
  console.log("Incoming request body:", req.body); // Log the incoming request body
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  let connection;
  try {
    connection = await dbPool.getConnection();

    const query = 'SELECT * FROM otp WHERE email = ? AND otp = ? AND expires_at > NOW()';
    const [rows] = await connection.execute(query, [email, otp]);

    console.log(`Verifying OTP for email: ${email}, OTP: ${otp}`);
    console.log(`Query Result:`, rows);

    if (rows.length > 0) {
      await connection.execute('DELETE FROM otp WHERE email = ? AND otp = ?', [email, otp]);
      io.emit('verificationAccepted', { email }); // Notify frontend about verification
      res.status(200).json({ message: "OTP verified successfully!" });
    } else {
      res.status(400).json({ error: "Invalid or expired OTP." });
    }
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});

// Existing endpoint to get todos
app.get('/getting_data', async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM todos');
    res.json(rows);
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});

// Existing endpoint to post todo items
app.post("/posting_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();

    const { todoItem } = req.body;

    if (!todoItem) {
      return res.status(400).json({ error: "Todo item is required." });
    }

    const currentDate = new Date();
    const query = 'INSERT INTO todos (item, created_at) VALUES (?, ?)';

    const [result] = await connection.execute(query, [todoItem, currentDate]);
    res.status(201).json({ id: result.insertId, item: todoItem, date: currentDate });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to save face data
app.post("/save_face_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();

    const { day, imgSrc } = req.body;

    if (!day || !imgSrc) {
      return res.status(400).json({ error: "Day and imgSrc are required." });
    }

    const query = 'INSERT INTO face_data (day, imgSrc) VALUES (?, ?)';
    const [result] = await connection.execute(query, [day, imgSrc]);

    res.status(201).json({ id: result.insertId, day, imgSrc });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});

// Endpoint to get the latest face data
app.get("/getting_face_data", async (req, res) => {
  let connection;
  try {
    connection = await dbPool.getConnection();
    const [rows] = await connection.execute('SELECT imgSrc FROM face_data ORDER BY created_at DESC LIMIT 1');
    res.json(rows);
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).send('Database connection error');
  } finally {
    if (connection) connection.release();
  }
});



// Endpoint to verify mail
// Endpoint to send verification email

app.post('/verify-mail', async (req, res) => {
  const { email } = req.body;

  const uniqueId = Date.now(); // Create a unique ID for verification
  const acceptLink = `https://progress-fe.onrender.com/verify/accept/${uniqueId}/${email}`;
  const rejectLink = `https://progress-fe.onrender.com/verify/reject/${uniqueId}/${email}`;

  try {
    const mailOptions = {
      from: 'seereddym@gmail.com',
      to: email,
      subject: 'Email Verification',
      html: `
        <p>Please verify your email by clicking one of the following buttons:</p>
        <a href="${acceptLink}" style="padding: 10px; background-color: green; color: white; text-decoration: none; border-radius: 5px;">Accept</a>
        <a href="${rejectLink}" style="padding: 10px; background-color: red; color: white; text-decoration: none; border-radius: 5px;">Reject</a>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Verification email sent.' });
  } catch (error) {
    console.error('Error sending verification email:', error);
    res.status(500).json({ message: 'Error sending verification email.' });
  }
});

// GET route to handle verification action
app.get('/verify/:action/:uniqueId/:email', (req, res) => {
  let { action, uniqueId, email } = req.params; // Use `let` to allow reassignment
  const timestamp = Date.now(); // Generate a unique timestamp
  const dateString = new Date(timestamp).toISOString(); // Convert the timestamp to an ISO string

  // Concatenate the action with the date string
  const verificationAction = `${action}_${dateString}`;

  const actionSubstring = action.substring(0, 6);

  // Ensure the action is either "accept" or "reject"
  if (actionSubstring === 'accept' || actionSubstring === 'reject') {
    // Set a cookie with the verification status
    res.cookie('verificationStatus', verificationAction, { httpOnly: true, maxAge: 600000 }); // 1-hour expiry

    // Optional: emit real-time status change (if using socket.io)
    // io.emit(`verification${action === 'accept' ? 'Accepted' : 'Rejected'}`, { email, timestamp });

    res.send({
      message: `Verification ${action}ed!`,
      uniqueAction: verificationAction, // Include the concatenated action in the response
      dateString : dateString
    });
  } else {
    res.status(400).send({ message: 'Invalid action' });
  }
});

// GET route to check the current verification status from cookies
app.get('/verification-status', (req, res) => {
  const status = req.cookies.verificationStatus;
  
  if (status) {
    res.json({ message: `Verification was ${status}` });
  } else {
    res.json({ message: 'No verification action has been performed yet.' });
  }
});








// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Example backend code
io.on("connection", (socket) => {
  // Emit event when verification is accepted
  socket.emit("verificationAccepted", { email: user.email });

  // Emit event when verification is rejected
  socket.emit("verificationRejected", { email: user.email });
});


// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});