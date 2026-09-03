<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { getStageModel, listStageModels } from './stage-models';
	import { STAGE_SCREEN_BODY_ID } from './timeline-entity-identity';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	// A body's inspector (ADR-0060 §3): what a body row, or the body on the
	// canvas, opens. The physical screen is the one body today; its field is
	// the registered model whose glass the Surface plane is (ADR-0059). Later
	// bodies bring their own ids and their own fields here.
	interface Props {
		bodyId: string;
	}

	let { bodyId }: Props = $props();

	const stageModels = listStageModels();

	function setScreenModel(model: string): void {
		const stage = engineState.stage;
		if (!stage) return;
		stage.screen = model === '' ? undefined : { model };
	}
</script>

{#if engineState.stage && bodyId === STAGE_SCREEN_BODY_ID}
	{@const stage = engineState.stage}
	<InspectorSection label={getStageModel(stage.screen?.model ?? '')?.label ?? 'Body'}>
		<Field label="Model">
			<select
				value={stage.screen?.model ?? ''}
				onchange={(e) => setScreenModel((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">None</option>
				{#each stageModels as model (model)}
					<option value={model}>{getStageModel(model)?.label ?? model}</option>
				{/each}
			</select>
		</Field>
	</InspectorSection>
{/if}
