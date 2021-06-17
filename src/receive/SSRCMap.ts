import { TypedEmitter } from 'tiny-typed-emitter';
import { Awaited } from '../util/util';

/**
 * The known data for a user in a Discord voice connection
 */
export interface VoiceUserData {
	/**
	 * The SSRC of the user's audio stream
	 */
	audioSSRC: number;
	/**
	 * The SSRC of the user's video stream (if one exists).
	 * Cannot be 0. If undefined, the user has no video stream.
	 */
	videoSSRC?: number;
	/**
	 * The Discord user ID of the user
	 */
	userId: string;
}

/**
 * The events that an SSRCMap may emit.
 */
export interface SSRCMapEvents {
	new: (newData: VoiceUserData) => Awaited<void>;
	update: (oldData: VoiceUserData | undefined, newData: VoiceUserData) => Awaited<void>;
	delete: (deletedData: VoiceUserData) => Awaited<void>;
}

/**
 * Maps audio SSRCs to data of users in voice connections.
 */
export class SSRCMap extends TypedEmitter<SSRCMapEvents> {
	/**
	 * The underlying map
	 */
	private readonly map: Map<number, VoiceUserData>;

	public constructor() {
		super();
		this.map = new Map();
	}

	/**
	 * Updates the map with new user data
	 *
	 * @param data The data to update with
	 */
	public update(data: VoiceUserData) {
		const existing = this.map.get(data.audioSSRC);

		const newValue = {
			...this.map.get(data.audioSSRC),
			...data,
		};

		this.map.set(data.audioSSRC, newValue);
		if (!existing) this.emit('new', newValue);
		this.emit('update', existing, newValue);
	}

	/**
	 * Gets the stored voice data of a user.
	 *
	 * @param target The target, either their user ID or audio SSRC
	 */
	public get(target: number | string) {
		if (typeof target === 'number') {
			return this.map.get(target);
		}
		for (const data of this.map.values()) {
			if (data.userId === target) {
				return data;
			}
		}
	}

	/**
	 * Deletes the stored voice data about a user.
	 *
	 * @param target The target of the delete operation, either their audio SSRC or user ID
	 * @returns The data that was deleted, if any
	 */
	public delete(target: number | string) {
		if (typeof target === 'number') {
			const existing = this.map.get(target);
			if (existing) {
				this.map.delete(target);
				this.emit('delete', existing);
			}
			return existing;
		}
		for (const [audioSSRC, data] of this.map.entries()) {
			if (data.userId === target) {
				this.map.delete(audioSSRC);
				this.emit('delete', data);
				return data;
			}
		}
	}

	public resolve(target: string, maxTime?: number): Promise<VoiceUserData> {
		const existing = this.get(target);
		if (existing) return Promise.resolve(existing);

		return new Promise((resolve, reject) => {
			let timeout: NodeJS.Timeout | undefined;
			if (typeof maxTime === 'number') {
				timeout = setTimeout(() => {
					this.off('new', onNew);
					reject(new Error(`Did not find SSRC for user ${target} within ${maxTime}ms`));
				}, maxTime);
			}

			const onNew = (userData: VoiceUserData) => {
				if (userData.userId === target) {
					this.off('new', onNew);
					if (timeout) clearTimeout(timeout);
					resolve(userData);
				}
			};
			this.on('new', onNew);
		});
	}
}
