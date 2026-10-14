import express, {Request, Response, NextFunction, RequestHandler} from "express"
import dotenv from "dotenv";
import {pool} from "./db";
import {firestore, FieldValue, Timestamp} from "./firebase";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
type TS = InstanceType<typeof Timestamp>
dotenv.config();

const app = express();
app.use(express.json());


class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const wrap =
(fn: (req: Request, res: Response)=>Promise<void>): RequestHandler =>
(req, res, next) => {
    fn(req, res).catch(next);
}

const toId = (v: unknown, name: string): number =>{
    const n = Number(v);
    if (!Number.isInteger(n) || n <=0) throw new HttpError(400, `${name} must be a positive integer`)
        return n
}

const toText = (v: unknown, name: string): string => {
    if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, `${name} is required`);
    return v.trim();
}

interface ChatRow {
    id: number,
    user_a_id: number,
     user_b_id: number,
    created_at: Date
}


const getChatOrFail = async (chatId: number): Promise<ChatRow> =>{
    const {rows} = await pool.query<ChatRow>("SELECT * FROM chats WHERE id = $1", [chatId]);
    if (rows.length === 0) throw new HttpError(404, "chat not found")
        return rows[0]
}

const assertMember = (chat: ChatRow,userId: number): void=> {
    if(chat.user_a_id !== userId && chat.user_b_id !== userId)
         throw new HttpError(403, "user is not a member of this chat")
}


const messagesRef = (chatId:number) => 
    firestore.collection("chats").doc(String(chatId)).collection("messages")

const lastSeenRef = (chatId:number, userId:number) => 
    firestore.collection("chats").doc(String(chatId)).collection("lastseen").doc(String(userId));



app.post(
    "/chat/create", 
    wrap(async (req, res) => {
        const a = toId(req.body.userAId, "userAId");
         const b = toId(req.body.userBId, "userBId");

         if(a === b) throw new Error("cannot create chat with yourself");
      
         const users = await pool.query("SELECT id FROM users WHERE id = ANY($1::int[])", [[a, b]]);
         if (users.rowCount !== 2) throw new Error("one or both users not found");

         const lo = Math.min(a, b);
        const hi = Math.max(a, b);

        const inserted = await pool.query<{id: number}>(
            `INSERT INTO chats (user_a_id, user_b_id) VALUES ($1, $2)
            ON CONFLICT (user_a_id, user_b_id) DO NOTHING RETURNING id`,
            [lo, hi]
        );
        if(inserted.rows.length > 0) {
            res.status(201).json({chatId: inserted.rows[0].id})
            return
        }
            const existing = await pool.query<{id: number}>(
            "SELECT id FROM chats WHERE user_a_id = $1 AND user_b_id = $2", [lo, hi]
)

res.json({chatId: existing.rows[0].id})
    })
)



app.post(
    "/chat/:chatId/message/send",
    wrap(async(req, res)=> {
          const chatId = toId(req.params.chatId, "chatId");
            const senderId = toId(req.body.senderId, "senderId");
            const text = toText(req.body.text, "text")

            const chat = await getChatOrFail(chatId);
            assertMember(chat, senderId);

            const docRef = messagesRef(chatId).doc();
            await docRef.set({
                senderId,
                text,
                createdAt: FieldValue.serverTimestamp(),
                readBy: {},
            })

            res.status(201).json({messageId:docRef.id, chatId, senderId, text});
    })
)

app.get(
    "/chat/:chatId/messages",
    wrap(async(req, res) => {
        const chatId = toId(req.params.chatId, "chatId");
        let limit = req.query.limit === undefined ? 50 : toId(req.query.limit, "limit");
        limit = Math.min(limit, 200);

        await getChatOrFail(chatId);
        const snap = await messagesRef(chatId).orderBy("createdAT", "desc").limit(limit).get();

        const messages = snap.docs
        .map((d: QueryDocumentSnapshot) => {
            const data = d.data();
            const readBy: Record<string, string> = {};
            for (const [uid, ts] of Object.entries(data.readBy ?? {})) {
                readBy[uid] = (ts as TS).toDate().toISOString();
            }
            return {
                id: d.id,
                senderId: data.senderId as number,
                 text: data.text as string,
                 createdAt: data.createdAt ? (data.createdAt as TS).toDate().toISOString() : null,
                 readBy,
            }
        })
        .reverse()
        res.json({chatId, count: messages.length,messages})
    })
)


app.post(
    "/chat/:chatId/lastseen",
    wrap(async(req, res) => {
        const chatId = toId(req.params.chatId, "chatId")
         const userId = toId(req.body.userId, "userId")
          const messageId = toText(req.params.messageId, "messageId");

          const chat = await getChatOrFail(chatId);
          assertMember(chat, userId);

          const msg = await messagesRef(chatId).doc(messageId).get();
          if(!msg.exists) throw new HttpError(404, "Messsage Not Found");

       await lastSeenRef(chatId, userId).set({
        messageId,
        updatedAt: FieldValue.serverTimestamp()
       })

       res.json({success: true, chatId, userId, messageId})
    })
)


app.get(
    "/user/:userId/chats",
      wrap(async(req, res)=> {
          const userId = toId(req.params.userId, "userId");

          const user = await pool.query("SELECT id FROM users WHERE id = $1",[userId]);
          if(user.rowCount === 0) throw new HttpError(404, "user not found")

            const {rows} = await pool.query<ChatRow>(
                `SELECT * FROM chats WHERE user_a_id = $1 OR user_b_id = $1 ORDER BY created_at DESC`,[userId]
            )
        res.json({
            chats: rows.map((c) => ({
                chatId: c.id,
                memberIds: [c.user_a_id, c.user_b_id],
                createdAt: c.created_at
            }))
        })
        
        })
)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction)=> {
    if (err instanceof HttpError) {
        res.status(err.status).json({error: err.message});
        return
    }
    console.error(err);
     res.status(500).json({error: "internal server error"});
})


const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`server running on port: ${PORT}`))