import pytest

from bots.services import model_router
from bots.services.model_router import ComplexityRoute, route_complexity


def describe_route_complexity():
    def test_low_simple_arithmetic():
        route = route_complexity("what is 2+2?")
        assert isinstance(route, ComplexityRoute)
        assert route.tier == "low"

    def test_high_multistep():
        route = route_complexity(
            "First explain photosynthesis, then compare it to cellular "
            "respiration, and also give me 3 quiz questions? What about "
            "the chemical equation?"
        )
        assert route.tier == "high"

    def test_high_code():
        route = route_complexity(
            "```python\ndef fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)\n```\n"
            "Why is this slow and how do I fix it with memoization?"
        )
        assert route.tier == "high"

    def test_high_essay():
        route = route_complexity(
            "Write an essay analyzing the causes of World War I in detail, "
            "with a thesis and three body paragraphs."
        )
        assert route.tier == "high"

    def test_probs_in_range():
        for text in ["hi", "what is 2+2?", "Explain quantum entanglement in detail with math"]:
            route = route_complexity(text)
            assert 0.0 <= route.complexity_p <= 1.0
            assert 0.0 <= route.confidence <= 1.0
            assert route.tier in ("low", "high")
            assert route.reason

    def test_api_mode_falls_back_to_heuristic(monkeypatch):
        monkeypatch.setattr(model_router, "_mode", lambda: "api")

        def boom(text, history_len=0):
            raise RuntimeError("jev down")

        monkeypatch.setattr(model_router, "query_jev", boom)
        route = route_complexity("what is 2+2?")
        assert route.tier == "low"


@pytest.mark.django_db
def describe_resolve_model_for_turn():
    def test_falls_back_safely_with_no_rows():
        from bots.models.ai_model import AiModel

        AiModel.objects.all().delete()
        model_id, route = model_router.resolve_model_for_turn(None, "what is 2+2?")
        assert route.tier == "low"
        assert model_id is None

    def test_low_prefers_cheap_default_high_prefers_bot():
        from django.core.management import call_command

        call_command('loaddata', 'ai_models.json')
        from bots.models.ai_model import AiModel
        from bots.models.bot import Bot

        cheap = AiModel.objects.filter(is_default=True).first()
        assert cheap is not None
        frontier = AiModel.objects.exclude(pk=cheap.pk).first()
        assert frontier is not None
        bot = Bot(name="t", ai_model=frontier)

        low_id, low_route = model_router.resolve_model_for_turn(bot, "what is 2+2?")
        assert low_route.tier == "low"
        assert low_id == cheap.model_id

        high_id, high_route = model_router.resolve_model_for_turn(
            bot, "Write an essay analyzing the causes of World War I in detail."
        )
        assert high_route.tier == "high"
        assert high_id == frontier.model_id
