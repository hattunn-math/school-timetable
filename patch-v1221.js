(() => {
  function bindLatestConditionHandlers(){
    const analyzeBtn=$("#analyzeConditionsBtn");
    const applyBtn=$("#applyConditionsBtn");
    if(analyzeBtn) analyzeBtn.onclick=()=>analyzeConditions();
    if(applyBtn) applyBtn.onclick=()=>applyConditions();
  }

  const previousRenderAllV1221=renderAll;
  renderAll=function(){
    previousRenderAllV1221();
    bindLatestConditionHandlers();
  };

  bindLatestConditionHandlers();
})();
