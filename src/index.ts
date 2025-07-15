import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from './routes/authRoutes';
import questionRoutes from './routes/questionRoutes';

dotenv.config();
const app = express();

// IMPORTANT: Raw body parser for webhooks MUST come before express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// Regular middleware for other routes
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

app.get("/", (req, res) => {
  res.send("This is home route");
});

// API routes
app.use('/api', routes);
app.use('/api/question', questionRoutes);

// Fix the port number in console log
app.listen(process.env.PORT || 3001, () => {
  console.log(`Server is running on port ${process.env.PORT || 3001}`);
});
