import { XUtils } from "@vex-chat/crypto";
import { XTypes } from "@vex-chat/types";
import express from "express";
import nacl from "tweetnacl";
import { stringify } from "uuid";
import winston from "winston";
import { protect } from ".";

import msgpack from "msgpack-lite";
import { Database } from "../Database";
import { censorUser, ICensoredUser } from "./utils";

const TokenScopes = XTypes.HTTP.TokenScopes;

export const getUserRouter = (
    db: Database,
    log: winston.Logger,
    tokenValidator: (key: string, scope: XTypes.HTTP.TokenScopes) => boolean
) => {
    const router = express.Router();

    router.get("/:id", protect, async (req, res) => {
        const user = await db.retrieveUser(req.params.id);

        if (user) {
            return res.send(msgpack.encode(censorUser(user)));
        } else {
            res.sendStatus(404);
        }
    });

    router.get("/:id/devices", protect, async (req, res) => {
        const deviceList = await db.retrieveUserDeviceList([req.params.id]);
        return res.send(msgpack.encode(deviceList));
    });

    router.get("/:id/permissions", protect, async (req, res) => {
        const userDetails: ICensoredUser = (req as any).user;
        try {
            const permissions = await db.retrievePermissions(
                userDetails.userID,
                "all"
            );
            res.send(msgpack.encode(permissions));
        } catch (err) {
            res.status(500).send(err.toString());
        }
    });

    router.get("/:id/servers", protect, async (req, res) => {
        const userDetails: ICensoredUser = (req as any).user;
        const servers = await db.retrieveServers(userDetails.userID);
        res.send(msgpack.encode(servers));
    });

    router.delete("/:userID/devices/:deviceID", protect, async (req, res) => {
        const device = await db.retrieveDevice(req.params.deviceID);

        if (!device) {
            res.sendStatus(404);
            return;
        }
        const userDetails = (req as any).user as ICensoredUser;
        if (userDetails.userID !== device.owner) {
            res.sendStatus(401);
            return;
        }
        const deviceList = await db.retrieveUserDeviceList([
            userDetails.userID,
        ]);
        if (deviceList.length === 1) {
            res.status(400).send({
                error: "You can't delete your last device.",
            });
            return;
        }

        await db.deleteDevice(device.deviceID);
        res.sendStatus(200);
    });

    router.post("/:id/devices", protect, async (req, res) => {
        const userDetails = (req as any).user;
        const devicePayload: XTypes.HTTP.IDevicePayload = req.body;

        const token = nacl.sign.open(
            XUtils.decodeHex(devicePayload.signed),
            XUtils.decodeHex(devicePayload.signKey)
        );

        if (!token) {
            log.warn("Invalid signature on token.");
            res.sendStatus(400);
            return;
        }

        if (tokenValidator(stringify(token), TokenScopes.Device)) {
            try {
                const device = await db.createDevice(
                    userDetails.userID,
                    devicePayload
                );
                res.send(msgpack.encode(device));
            } catch (err) {
                console.warn(err);
                // failed registration due to signkey being taken
                res.sendStatus(470);
                return;
            }
        } else {
            res.sendStatus(401);
        }
    });

    return router;
};
