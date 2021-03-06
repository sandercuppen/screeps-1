import { defaults } from 'lodash';
import { Configuration } from 'webpack';

export default (options: EnvOptions): Configuration => {
	defaults(options, {
		ENV: 'dev',
		ROOT: __dirname,
		TEST: false,
	});
	return require(`./webpack/config.${options.ENV}`).default(options);
};
