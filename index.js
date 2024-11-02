const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const bodyParser = require("body-parser");

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
  },
  {
    toJSON: {
      versionKey: false,
      virtuals: true,
    },
  }
);

userSchema.virtual("log", {
  ref: "Exercise",
  localField: "_id",
  foreignField: "user",
});

userSchema.virtual("count", {
  ref: "Exercise",
  localField: "_id",
  foreignField: "user",
  count: true,
});

const exerciseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    toJSON: {
      versionKey: false,
      transform: (doc, ret) => {
        ret.date = new Date(doc.date).toDateString();
        return ret;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);
const Exercise = mongoose.model("Exercise", exerciseSchema);

async function main() {
  await mongoose.connect(process.env.MONGO_DB_URL);

  app.use(cors());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.static("public"));
  app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
  });

  app.get("/api/users", async (req, res) => {
    const users = await User.find();
    res.json(users);
  });

  app.post("/api/users", async (req, res) => {
    try {
      const user = new User({ username: req.body.username });
      const userResult = await user.save();
      res.json(userResult);
    } catch (error) {
      res.status(500).send(error.toString());
    }
  });

  app.use("/api/users/:userId", async (req, res, next) => {
    try {
      const userResult = await User.findById(req.params.userId);
      if (userResult == null)
        throw new Error(`Could not find user with id '${req.params.userId}'`);
      req.user = userResult;
      next();
    } catch (error) {
      console.error("Error while reading user", error);
      res.status(500).send(error.toString());
    }
  });

  app.post("/api/users/:userId/exercises", async (req, res) => {
    try {
      const exercise = new Exercise({
        description: req.body.description,
        duration: req.body.duration,
        date: req.body.date !== "" ? req.body.date : undefined,
        user: req.user._id,
      });
      const exerciseResult = await exercise.save();

      const output = {
        ...exerciseResult.toJSON(),
        ...{ _id: req.user._id, username: req.user.username },
      };
      delete output.user;

      res.json(output);
    } catch (error) {
      console.error(error);
      res.status(500).send(error.toString());
    }
  });

  app.get("/api/users/:userid/logs", async (req, res) => {
    try {
      const match =
        req.query.from !== undefined && req.query.to !== undefined
          ? {
              date: {
                $gte: req.query.from,
                $lte: req.query.to,
              },
            }
          : undefined;

      const userWithLogsResult = await User.findById(req.user._id)
        .populate({
          path: "log",
          match,
          perDocumentLimit: req.query.limit || undefined,
          select: "-_id",
          transform: (doc) => {
            doc.user = undefined; // cannot be ignored via selection, because that prevents a successful population ('user' is the key for population)
            return doc;
          },
        })
        .populate({
          path: "count",
          match,
          perDocumentLimit: req.query.limit || undefined,
        })
        .exec();

      if (userWithLogsResult == null)
        throw new Error(
          `Could not find logs for user with id '${req.user._id}'`
        );

      const output = userWithLogsResult.toJSON();
      delete output.id;

      res.json(output);
    } catch (error) {
      console.error(error);
      res.status(500).send(error.toString());
    }
  });

  const listener = app.listen(process.env.PORT || 3000, () => {
    console.log("Your app is listening on port " + listener.address().port);
  });
}

main();
