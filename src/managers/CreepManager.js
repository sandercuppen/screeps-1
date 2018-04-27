import _ from 'lodash';
import { Manager } from './Manager';

export class CreepManager extends Manager {
	constructor() {
		super('creep');
		this.clean();
		this.rebootFromMemory();
	}

	clean() {
		_.forEach(Object.keys(Memory.creeps), creepName => {
			const e = Game.creeps[creepName];
			if (!e) delete Memory.creeps[creepName];
		});
	}
}