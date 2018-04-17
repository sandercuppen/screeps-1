import { RoomManager } from '../../class';

class OrdersManager extends RoomManager {
	constructor() {
		super('orders');
	}

	analyzeRoom = (room: Room, needMemoryResync?: boolean): void => {
		if (Game.time % PROCESS_ORDERS_INTERVAL === 0 || room.name === 'sim') {
			room.updateResourceOrders();
			let orderingRoom = Util.orderingRoom();
			if (orderingRoom.length === 1 && room.name !== orderingRoom[0].name) {
				room.updateRoomOrders();
				room.terminalBroker();
			}
		}
	};
	prototypeExtend = () => {
		this.assignRoomPrototype({
			updateResourceOrders: {
				value() {
					let data = this.memory.resources;
					if (!this.my || !data) return;

					// go through reallacation orders and reset completed orders
					for (let structureType in data) {
						for (let i = 0; i < data[structureType].length; i++) {
							let structure = data[structureType][i];
							// don't reset busy labs
							if (structureType == STRUCTURE_LAB && structure.reactionState != LAB_IDLE) continue;
							if (!structure.orders) continue;
							for (let j = 0; j < structure.orders.length; j++) {
								let order = structure.orders[j];
								if (order.orderRemaining <= 0) {
									let baseAmount = 0;
									let rcl = this.RCL;
									if (structureType == STRUCTURE_STORAGE)
										baseAmount = order.type == RESOURCE_ENERGY ? MIN_STORAGE_ENERGY[rcl] : MAX_STORAGE_MINERAL;
									else if (structureType == STRUCTURE_TERMINAL)
										baseAmount = order.type == RESOURCE_ENERGY ? TERMINAL_ENERGY : 0;
									baseAmount += order.storeAmount;
									let amount = 0;
									let cont = Game.getObjectById(structure.id);
									if (cont) {
										switch (structureType) {
											case STRUCTURE_LAB:
												// get lab amount
												if (order.type == cont.mineralType) {
													amount = cont.mineralAmount;
												} else if (order.type == RESOURCE_ENERGY) {
													amount = cont.energy;
												}
												break;
											case STRUCTURE_POWER_SPAWN:
												// get powerSpawn amount
												if (order.type == RESOURCE_POWER) {
													amount = cont.power;
												} else if (order.type == RESOURCE_ENERGY) {
													amount = cont.energy;
												}
												break;
											case STRUCTURE_NUKER:
												// get nuker amount
												if (order.type == RESOURCE_GHODIUM) {
													amount = cont.ghodium;
												} else if (order.type == RESOURCE_ENERGY) {
													amount = cont.energy;
												}
												break;
											default:
												// get stored amount
												amount = cont.store[order.type] || 0;
												break;
										}
									}
									if (amount <= baseAmount) {
										order.orderAmount = 0;
										order.orderRemaining = 0;
									}
								}
							}
						}
					}
				},
			},
			updateRoomOrders: {
				value() {
					if (!this.memory.resources || !this.memory.resources.orders) return;
					let rooms = _.filter(Game.rooms, room => {
						return room.my && room.storage && room.terminal && room.name !== this.name;
					});
					let orders = this.memory.resources.orders;
					for (let i = 0; i < orders.length; i++) {
						let order = orders[i];
						let amountRemaining = order.amount;
						for (let j = 0; j < order.offers.length; j++) {
							let offer = order.offers[j];
							if (
								Memory.rooms[offer.room] &&
								Memory.rooms[offer.room].resources &&
								Memory.rooms[offer.room].resources.offers
							) {
								let remoteOffers = Memory.rooms[offer.room].resources.offers;
								let idx = remoteOffers.indexOf(o => {
									return o.room === this.name && o.id === order.id && o.type === order.type;
								});
								if (idx !== -1) remoteOffers.splice(idx, 1);
							}
						}
						order.offers = [];
						if (amountRemaining <= 0) {
							// orders.splice(i, 1);
							// i--;
							delete orders[i];
							orders.splice(i--, 1);
						} else {
							rooms.sort((a, b) => {
								return (
									Game.map.getRoomLinearDistance(this.name, a.name, true) -
									Game.map.getRoomLinearDistance(this.name, b.name, true)
								);
							});
							for (let j = 0; j < rooms.length; j++) {
								let room = rooms[j];
								if (room.memory.resources === undefined) {
									room.memory.resources = {
										lab: [],
										container: [],
										terminal: [],
										storage: [],
										powerSpawn: [],
										nuker: [],
									};
								}
								if (!room.memory.resources.offers) room.memory.resources.offers = [];
								let remoteOffers = room.memory.resources.offers;
								let available = room.resourcesAll[order.type] || 0;
								Log.room(room.name, `available: ${available} ${order.type}`);
								if (available < MIN_OFFER_AMOUNT) continue;

								// for COMPOUNDS_TO_ALLOCATE
								if (!_.isUndefined(COMPOUNDS_TO_ALLOCATE[order.type])) {
									let reservedAmount =
										COMPOUNDS_TO_ALLOCATE[order.type].amount + COMPOUNDS_TO_ALLOCATE[order.type].threshold;
									if (available < reservedAmount + MIN_OFFER_AMOUNT) continue;
									else available = available - reservedAmount;
								}

								if (amountRemaining < MIN_OFFER_AMOUNT && amountRemaining > 0) amountRemaining = MIN_OFFER_AMOUNT;

								available = Math.min(available, amountRemaining);

								let existingOffer = order.offers.find(o => {
									return o.room === room.name;
								});
								let existingRemoteOffer = remoteOffers.find(o => {
									return o.room === this.name && o.id === order.id && o.type === order.type;
								});
								if (existingOffer) {
									if (LOG_TRACE)
										Log.trace('Room', {
											roomName: this.name,
											remoteRoom: room.name,
											actionName: 'updateRoomOrders',
											subAction: 'update',
											orderId: order.id,
											resourceType: order.type,
											amount: available,
										});
									amountRemaining -= available - existingOffer.amount;
									existingOffer.amount = available;
								} else {
									if (LOG_TRACE)
										Log.trace('Room', {
											roomName: this.name,
											remoteRoom: room.name,
											actionName: 'updateRoomOrders',
											subAction: 'new',
											orderId: order.id,
											resourceType: order.type,
											amount: available,
										});
									Log.room(
										this.name,
										`Room offer from ${room.name} with id ${order.id} placed for ${available} ${order.type}.`,
									);
									amountRemaining -= available;
									order.offers.push({
										room: room.name,
										amount: available,
									});
								}
								if (existingRemoteOffer) {
									existingRemoteOffer.amount = available;
								} else {
									remoteOffers.push({
										room: this.name,
										id: order.id,
										type: order.type,
										amount: available,
									});
								}
								if (amountRemaining <= 0) break;
							}
						}
					}
				},
			},
			fillARoomOrder: {
				value() {
					if (!(this.terminal && this.memory && this.memory.resources && this.memory.resources.offers)) return false;
					const offers = this.memory.resources.offers;
					let ret = false;
					for (let i = 0; i < offers.length; i++) {
						let offer = offers[i];
						let targetRoom = Game.rooms[offer.room];
						if (!(targetRoom && targetRoom.memory && targetRoom.memory.resources && targetRoom.memory.resources.orders))
							continue;
						let order = targetRoom.memory.resources.orders.find(o => {
							return o.id == offer.id && o.type == offer.type;
						});
						if (!order) continue;
						let targetOfferIdx = order.offers.findIndex(o => {
							return o.room == this.name;
						});
						if (targetOfferIdx == -1) {
							Log.room(this.name, 'Orphaned offer found and deleted');
							offers.splice(i--, 1);
							continue;
						}

						let store = this.terminal.store[offer.type] || 0;
						let onOrder = 0;
						let terminalOrder = null;
						if (this.memory.resources.terminal[0])
							terminalOrder = this.memory.resources.terminal[0].orders.find(o => {
								return o.type == offer.type;
							});
						if (terminalOrder) onOrder = terminalOrder.orderRemaining;
						let amount = Math.max(offer.amount, MIN_OFFER_AMOUNT);
						if (amount > store + onOrder) {
							let amt = amount - (store + onOrder);
							if (LOG_TRACE)
								Log.trace('Room', {
									actionName: 'fillARoomOrder',
									subAction: 'terminalOrder',
									roomName: this.name,
									targetRoomName: targetRoom.name,
									resourceType: offer.type,
									amount: amt,
								});
							this.placeOrder(this.terminal.id, offer.type, amt);
						}
						if (!targetRoom.terminal) continue;
						let space = targetRoom.terminal.storeCapacity - targetRoom.terminal.sum;
						amount = Math.min(amount, space, store);

						let cost = Game.market.calcTransactionCost(amount, this.name, targetRoom.name);
						if (offer.type == RESOURCE_ENERGY) {
							amount -= cost;
							cost += amount;
						}
						if (cost > (this.terminal.store.energy || 0)) continue;
						if (amount < MIN_OFFER_AMOUNT) continue;

						ret = this.terminal.send(offer.type, amount, targetRoom.name, order.id);
						if (ret == OK) {
							if (LOG_TRACE)
								Log.trace('Room', {
									actionName: 'fillARoomOrder',
									roomName: this.name,
									targetRoomName: targetRoom.name,
									resourceType: offer.type,
									amount: amount,
								});
							Log.room(this.name, `Send ${offer.type} ${amount} to ${Util.makeRoomUrl(targetRoom.name)}.`);
							offer.amount -= amount;
							if (offer.amount > 0) {
								order.offers[targetOfferIdx].amount = offer.amount;
							} else {
								delete order.offers[targetOfferIdx];
								order.offers.splice(targetOfferIdx, 1);
								delete offers[i];
								offers.splice(i--, 1);
							}
							order.amount -= amount;
							return true;
						} else {
							Log.error(
								`Send Error: ${Util.translateErrorCode(ret)} | ${this.name} send ${
									offer.type
								} ${amount} to ${Util.makeRoomUrl(targetRoom.name)}.`,
							);
						}
					}

					return ret;
				},
			},
			prepareResourceOrder: {
				value(containerId, resourceType, amount) {
					let container = Game.getObjectById(containerId);
					if (
						!this.my ||
						!container ||
						!container.room.name == this.name ||
						!(
							container.structureType == STRUCTURE_LAB ||
							container.structureType == STRUCTURE_NUKER ||
							container.structureType == STRUCTURE_POWER_SPAWN ||
							container.structureType == STRUCTURE_CONTAINER ||
							container.structureType == STRUCTURE_STORAGE ||
							container.structureType == STRUCTURE_TERMINAL
						)
					) {
						return ERR_INVALID_TARGET;
					}
					if (!RESOURCES_ALL.includes(resourceType)) {
						return ERR_INVALID_ARGS;
					}
					if (this.memory.resources === undefined) {
						this.memory.resources = {
							lab: [],
							powerSpawn: [],
							nuker: [],
							container: [],
							terminal: [],
							storage: [],
						};
					}
					if (this.memory.resources.nuker === undefined) this.memory.resources.nuker = [];
					if (this.memory.resources.powerSpawn === undefined) this.memory.resources.powerSpawn = [];
					if (!this.memory.resources[container.structureType].find(s => s.id == containerId)) {
						this.memory.resources[container.structureType].push(
							container.structureType == STRUCTURE_LAB
								? {
										id: containerId,
										orders: [],
										reactionState: LAB_IDLE,
								  }
								: {
										id: containerId,
										orders: [],
								  },
						);
					}
					if (container.structureType == STRUCTURE_LAB && resourceType != RESOURCE_ENERGY && amount > 0) {
						// clear other resource types since labs only hold one at a time
						let orders = this.memory.resources[STRUCTURE_LAB].find(s => s.id == containerId).orders;
						for (let i = 0; i < orders.length; i++) {
							if (orders[i].type != resourceType && orders[i].type != RESOURCE_ENERGY) {
								orders[i].orderAmount = 0;
								orders[i].orderRemaining = 0;
								orders[i].storeAmount = 0;
							}
						}
					}
					return OK;
				},
			},
			cancelOrder: {
				value(containerId, resourceType = null) {
					let container = Game.getObjectById(containerId);
					if (this.prepareResourceOrder(containerId, RESOURCE_ENERGY, 0) != OK) return ret;

					let containerData = this.memory.resources[container.structureType].find(s => s.id == containerId);
					if (containerData) {
						if (resourceType) {
							let existingOrder = containerData.orders.find(r => r.type == resourceType);
							if (existingOrder) {
								// delete structure order
								if (LOG_TRACE)
									Log.trace('Room', {
										roomName: this.name,
										actionName: 'cancelOrder',
										orderId: orderId,
										resourceType: resourceType,
									});
								containerData.orders.splice(containerData.orders.indexOf(existingOrder), 1);
							}
						} else {
							// delete all of structure's orders
							if (LOG_TRACE)
								Log.trace('Room', {
									roomName: this.name,
									actionName: 'cancelOrder',
									orderId: orderId,
									resourceType: 'all',
								});
							containerData.orders = [];
						}
					}
					return OK;
				},
			},
			registerBoostLab: {
				value(labId) {
					let lab = Game.getObjectById(labId);
					if (lab) {
						if (_.isUndefined(this.memory.resources)) {
							this.memory.resources = {
								lab: [],
								powerSpawn: [],
								nuker: [],
								container: [],
								terminal: [],
								storage: [],
							};
						}
						let dataIndex = this.memory.resources.lab.findIndex(x => x.id == labId);
						if (dataIndex > -1) {
							delete this.memory.resources.lab[dataIndex].reactionType;
							this.memory.resources.lab[dataIndex].reactionState = 'Storage';
						} else {
							let obj = { id: labId, orders: [], reactionState: 'Storage' };
							this.memory.resources.lab.push(obj);
						}
					}
				},
			},
			unRegisterBoostLab: {
				value(labId) {
					const lab = Game.getObjectById(labId);
					const data = this.memory.resources;

					if (lab && data) {
						let dataIndex = this.memory.resources.lab.findIndex(x => x.id === labId);
						if (dataIndex > -1) {
							if (data.reactions.orders.length > 0)
								this.memory.resources.lab[dataIndex].reactionType = this.memory.resources.reactions.orders[0].type;
							this.memory.resources.lab[dataIndex].reactionState = 'idle';
							this.memory.resources.lab[dataIndex].orders = _.filter(
								this.memory.resources.lab[dataIndex].orders,
								'type',
								'energy',
							);
						}
					}
				},
			},
			placeOrder: {
				value(containerId, resourceType, amount) {
					const container = Game.getObjectById(containerId);
					let ret = this.prepareResourceOrder(containerId, resourceType, amount);
					if (ret != OK) {
						return ret;
					}

					let containerData = this.memory.resources[container.structureType].find(s => s.id == containerId);
					if (containerData) {
						let existingOrder = containerData.orders.find(r => r.type == resourceType);
						if (existingOrder) {
							existingOrder.orderAmount += amount;
							existingOrder.orderRemaining += amount;
						} else {
							let containerStore = 0;
							if (container.structureType === STRUCTURE_LAB) {
								containerStore = container.mineralType == resourceType ? container.mineralAmount : 0;
							} else {
								containerStore = container.store[resourceType] || 0;
							}
							containerData.orders.push({
								type: resourceType,
								orderAmount: amount,
								orderRemaining: amount - containerStore,
								storeAmount: 0,
							});
							if (container.structureType === STRUCTURE_LAB && containerData.reactionState != 'Storage') {
								containerData.reactionType = resourceType;
							}
						}
					}
					return OK;
				},
			},
			setStore: {
				value(containerId, resourceType, amount) {
					let container = Game.getObjectById(containerId);
					let ret = this.prepareResourceOrder(containerId, resourceType, amount);
					if (ret != OK) {
						return ret;
					}

					let containerData = this.memory.resources[container.structureType].find(s => s.id == containerId);
					if (containerData) {
						let existingOrder = containerData.orders.find(r => r.type == resourceType);
						if (existingOrder) {
							existingOrder.storeAmount = amount;
						} else {
							containerData.orders.push({
								type: resourceType,
								orderAmount: 0,
								orderRemaining: 0,
								storeAmount: amount,
							});
						}
					}
					return OK;
				},
			},
			cancelRoomOrder: {
				value(orderId = null, resourceType = null) {
					if (this.memory.resources === undefined) {
						this.memory.resources = {
							lab: [],
							powerSpawn: [],
							nuker: [],
							container: [],
							terminal: [],
							storage: [],
						};
					}
					if (this.memory.resources.nuker === undefined) this.memory.resources.nuker = [];
					if (this.memory.resources.powerSpawn === undefined) this.memory.resources.powerSpawn = [];
					if (this.memory.resources.orders === undefined) {
						this.memory.resources.orders = [];
					}
					let orders = this.memory.resources.orders;
					if (orderId && resourceType) {
						let existingOrder = orders.find(o => {
							return o.id == orderId && o.type == resourceType;
						});
						if (existingOrder) {
							// delete existing order
							if (LOG_TRACE)
								Log.trace('Room', {
									roomName: this.name,
									actionName: 'cancelRoomOrder',
									orderId: orderId,
									resourceType: resourceType,
								});
							orders.splice(orders.indexOf(existingOrder), 1);
						}
					} else if (orderId) {
						// delete all orders matching orderId
						if (LOG_TRACE)
							Log.trace('Room', {
								roomName: this.name,
								actionName: 'cancelRoomOrder',
								orderId: orderId,
								resourceType: 'all',
							});
						for (let i = 0; i < orders.length; i++) {
							let order = orders[i];
							if (order.id === orderId) {
								orders.splice(i--, 1);
							}
						}
					} else {
						// delete all orders associated with this room
						this.memory.resources.orders = [];
					}

					return OK;
				},
			},
			placeRoomOrder: {
				value(orderId, resourceType, amount) {
					if (amount <= 0) return OK;
					if (this.memory.resources === undefined) {
						this.memory.resources = {
							lab: [],
							powerSpawn: [],
							nuker: [],
							container: [],
							terminal: [],
							storage: [],
						};
					}
					if (this.memory.resources.nuker === undefined) this.memory.resources.nuker = [];
					if (this.memory.resources.powerSpawn === undefined) this.memory.resources.powerSpawn = [];
					if (this.memory.resources.orders === undefined) {
						this.memory.resources.orders = [];
					}
					let orders = this.memory.resources.orders;
					let existingOrder = orders.find(o => {
						return o.id == orderId && o.type == resourceType;
					});
					if (existingOrder) {
						// update existing order
						if (LOG_TRACE)
							Log.trace('Room', {
								roomName: this.name,
								actionName: 'placeRoomOrder',
								subAction: 'update',
								orderId: orderId,
								resourceType: resourceType,
								amount: amount,
							});
						existingOrder.amount = amount;
					} else {
						// create new order
						if (LOG_TRACE)
							Log.trace('Room', {
								roomName: this.name,
								actionName: 'placeRoomOrder',
								subAction: 'new',
								orderId: orderId,
								resourceType: resourceType,
								amount: amount,
							});
						Log.room(this.name, `New room order with id ${orderId} placed for ${amount} ${resourceType}.`);
						orders.push({
							id: orderId,
							type: resourceType,
							amount: amount,
							offers: [],
						});
					}
					return OK;
				},
			},
			terminalBroker: {
				value() {
					Log.module('TerminalBroker', 'Checking...');
					if (!this.my || !this.terminal || !this.storage) return;
					if (this.terminal.cooldown && this.terminal.cooldown > 0) return;
					let transacting = false;
					for (const mineral in this.terminal.store) {
						if (mineral === RESOURCE_ENERGY || mineral === RESOURCE_POWER) continue;
						if ((MAKE_COMPOUNDS || ALLOCATE_COMPOUNDS) && mineral !== this.memory.mineralType) continue;
						let terminalFull = this.terminal.sum / this.terminal.storeCapacity > 0.8;

						if (this.terminal.store[mineral] >= MIN_MINERAL_SELL_AMOUNT) {
							let buyRatio;
							if (AUTOMATED_RATIO_COUNT) {
								buyRatio = Util.countPrices('buy', mineral, this.name);

								if (buyRatio === 0) Log.warn(this.print, `there is no buy order for ${mineral}`);
								else Log.info(`average buyRatio: ${this.name} ${mineral} ${buyRatio}`);
							} else buyRatio = MIN_SELL_RATIO[mineral];

							let orders = Game.market.getAllOrders(o => {
								if (!o.roomName || o.resourceType != mineral || o.type != 'buy' || o.amount < MIN_MINERAL_SELL_AMOUNT)
									return false;

								o.range = Game.map.getRoomLinearDistance(o.roomName, this.name, true);
								o.transactionAmount = Math.min(o.amount, this.terminal.store[mineral]);
								o.transactionCost = Game.market.calcTransactionCost(o.transactionAmount, this.name, o.roomName);
								if (o.transactionCost > this.terminal.store.energy && o.transactionAmount > MIN_MINERAL_SELL_AMOUNT) {
									// cant afford. try min amount
									o.transactionAmount = MIN_MINERAL_SELL_AMOUNT;
									o.transactionCost = Game.market.calcTransactionCost(o.transactionAmount, this.name, o.roomName);
								}

								o.credits = o.transactionAmount * o.price;
								// o.ratio = o.credits/o.transactionCost; // old formula
								// o.ratio = (o.credits-o.transactionCost)/o.transactionAmount; // best offer assuming 1e == 1 credit
								// o.ratio = o.credits/(o.transactionAmount+o.transactionCost); // best offer assuming 1e == 1 mineral
								o.ratio = (o.credits - o.transactionCost * ENERGY_VALUE_CREDITS) / o.transactionAmount; // best offer assuming 1e == ENERGY_VALUE_CREDITS credits

								return (
									terminalFull ||
									(o.ratio >= buyRatio &&
										// o.range <= MAX_SELL_RANGE &&
										o.transactionCost <= this.terminal.store.energy)
								);
							});

							if (orders.length > 0) {
								let order = _.max(orders, 'ratio');
								Log.info('selected order: ');
								Log.stringify(order);
								let result = Game.market.deal(order.id, order.transactionAmount, this.name);
								if (SELL_NOTIFICATION)
									Log.room(
										this.name,
										`Selling ${order.transactionAmount} ${mineral} for ${Util.roundUp(order.credits)} (${
											order.price
										} ¢/${mineral}, ${order.transactionCost} e): ${Util.translateErrorCode(result)}`,
									);
								if (SELL_NOTIFICATION)
									Game.notify(
										`<h2>Room ${this.name} rund an order!</h2><br/>Result: ${Util.translateErrorCode(
											result,
										)}<br/>Details:<br/>${JSON.stringify(order).replace(',', ',<br/>')}`,
									);
								transacting = result == OK;
								break;
							}
						}
					}
					if (
						this.controller.level == 8 &&
						!transacting &&
						Util.chargeScale(
							this.storage.store.energy - ENERGY_BALANCE_TRANSFER_AMOUNT,
							MIN_STORAGE_ENERGY[this.controller.level],
							MAX_STORAGE_ENERGY[this.controller.level],
						) > 1 &&
						(this.terminal.store[this.mineralType] || 0) < 150000 &&
						this.terminal.store.energy > ENERGY_BALANCE_TRANSFER_AMOUNT * 1.1
					) {
						let requiresEnergy = room =>
							room.my &&
							room.storage &&
							room.terminal &&
							room.terminal.sum < room.terminal.storeCapacity - ENERGY_BALANCE_TRANSFER_AMOUNT &&
							room.storage.sum < room.storage.storeCapacity * TARGET_STORAGE_SUM_RATIO &&
							!room._isReceivingEnergy &&
							room.storage.store[RESOURCE_ENERGY] < MAX_STORAGE_ENERGY[room.RCL];
						let targetRoom = _.min(_.filter(Game.rooms, requiresEnergy), 'storage.store.energy');
						if (
							targetRoom instanceof Room &&
							Game.market.calcTransactionCost(ENERGY_BALANCE_TRANSFER_AMOUNT, this.name, targetRoom.name) <
								this.terminal.store.energy - ENERGY_BALANCE_TRANSFER_AMOUNT
						) {
							targetRoom._isReceivingEnergy = true;
							let response = this.terminal.send('energy', ENERGY_BALANCE_TRANSFER_AMOUNT, targetRoom.name, 'have fun');
							Log.room(
								this.name,
								`Transferring ${Util.formatNumber(ENERGY_BALANCE_TRANSFER_AMOUNT)} energy to ${
									targetRoom.name
								}: ${Util.translateErrorCode(response)}`,
							);
							transacting = response == OK;
						}
					}
					if (transacting !== true && _.isUndefined(Memory.boostTiming)) {
						Log.module('TerminalBroker', 'FillARoomOrder...');
						this.fillARoomOrder();
					}
				},
			},
		});
	};
}

export default new OrdersManager();