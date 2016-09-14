function syn(e, f)
{
	var id = f[e + ':id'] || f['id'];
	var syntax = e == 'basic' ? f['syntax'] : f[e + ':syntax'];

	if (id && typeof syntax == 'string' && id.length > 2)
	{
		list[e][id] = syntax;
		syntax = id.charAt(0);
		id = '|' + id.replace(/[*+^$[\](){}\.-]/g, '\\$&');
		syntax = id.charAt(id.length - 1);
		syntax = syntax == '(' || syntax == '{' ? id.slice(0, -2) + '\\b' : id;
		var i = id.charAt(1);

		if (i == '#')
			defs[e] += syntax;
		else if (i == i.toUpperCase())
			builtins[e] += syntax;
		else
			tags[e] += syntax;
	}
}

function tax(e, f)
{
	$.ajax({url: 'js/cm-mode/' + e + '.json', async: false, success: function(g)
	{
		if(typeof g !== 'object')
			g = JSON.parse(g);

		for (var h = 0; h < g.length; h++)
		{
			if (Object.prototype.toString.call(g[h]) == '[object Array]')
			{
				for (var i = 0; i < g[h].length; i++)
					if (h != 0xbb || i < 0x6d || i == 0xce)
						syn(e, g[h][i]);
			}
			else
			{
				syn(e, g[h]);
			}
		}

		tags[e] = tags[e].length ? new RegExp('^(' + tags[e].slice(1) + ')') : /$./;
		builtins[e] = builtins[e].length ? new RegExp('^(' + builtins[e].slice(1) + ')') : /$./;
		defs[e] = defs[e].length ? new RegExp('^(' + defs[e].slice(1) + ')') : /$./;

		if (typeof f == 'function')
			f();
	}, error: function(e) { console.error('Failed to access basic JSON sheet !'); console.error(e); }});
}

list = {basic: {}};
keywords = {basic: /^(If |Then|Else|For\b|While |Repeat |End|Pause |IS>\b|DS<\b|Menu\b|Return|Stop|DelVar |OpenLib\b|ExecLib\b)/};
defs = {basic: ''};
builtins = {basic: ''};
tags = {basic: ''};

tax('basic', function()
{
	CodeMirror.defineMode('basic', function()
		{
		return {startState: function()
		{
			return {number: false};
		}, token: function(stream, state)
		{
			if (stream.match(/^(\d+\.?\d*|\.\d+)(\|E\d\d?)?|\|E\d\d?/))
			{
				if (state.number)
					return 'error';

				state.number = true;
				return 'number';
			}

			state.number = false;

			if (stream.match(/^L[1-6]|\[[A-J]\]|(GDB|Pic|Str)\d|\|N|I%|[PF]V|PMT|[PC]\/Y/))
				return 'variable-3';

			if (stream.match(/^Z?([XY](min|max|scl|res|Fact)|Delta[XY]|(T|theta)(min|max|step)|[uvw]\(nMin\)|nMin|nMax|PlotSt(art|ep))|Tbl(Start|Input)|DeltaTbl|GraphStyle\b/))
				return 'variable-2';

			if (stream.match('|L'))
				return stream.match(/^([A-Z]|theta)([\dA-Z]|theta)*/) && stream.current().replace(/theta/, '_').length < 8 ? 'variable-3' : 'error';

			if (stream.match(/^[XY]\dT|^[rY]\d|[uvw]/))
				return 'string-2';

			if (stream.match('prgm'))
				return stream.match(/^([A-Z]|theta)([\dA-Z]|theta)*/) && stream.current().replace(/theta/, '_').length < 13 ? 'keyword' : 'error';

			if (stream.match(keywords.basic))
				return 'keyword';

			if (stream.match(builtins.basic))
				return 'builtin';

			if (stream.match(tags.basic))
				return 'tag';

			if (stream.match(/\[[ei]\]|pi/))
				return 'number';

			var w = stream.next();

			if (w == '"')
			{
				while (w = stream.next())
				{
					if (w == '"')
						break;

					if (w == '-' && stream.peek() == '>')
					{
						stream.backUp(1);
						break;
					}
				}

				return 'string';
			}
			else if (/[a-z]/.test(w))
			{
				return 'error';
			}

			return null;
		}};
	})
});
